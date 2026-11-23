"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  fmtTime,
  newClientId,
  userTz,
  type ClientBucket,
  type DayReport,
  type RangeReport,
} from "@/lib/client";
import {
  addDays,
  dayLabel,
  monthLabel,
  monthRange,
  shiftMonth,
  shortLabel,
  todayStr,
  weekStart,
  weekdayInitial,
} from "@/lib/dates";
import { formatMinutes } from "@/lib/time";
import { Toast, type ToastState } from "./Toast";
import { BackHome } from "@/components/BackHome";

export type View = "day" | "week" | "month";

type Key = string;
const keyFor = (view: View, date: string): Key => {
  if (view === "day") return `day:${date}`;
  if (view === "week") return `week:${weekStart(date)}`;
  return `month:${monthRange(date).from}`;
};

function shift(view: View, date: string, dir: -1 | 1): string {
  if (view === "day") return addDays(date, dir);
  if (view === "week") return addDays(date, 7 * dir);
  return shiftMonth(date, dir);
}

const SWIPE_PX = 60;

export function ReportsView({ initialView, initialDate }: { initialView: View; initialDate?: string }) {
  const [today, setToday] = useState<string | null>(null);
  const [view, setView] = useState<View>(initialView);
  const [date, setDate] = useState<string | null>(initialDate ?? null);
  const [buckets, setBuckets] = useState<ClientBucket[] | null>(null);
  const [cache, setCache] = useState<Record<Key, DayReport | RangeReport>>({});
  const [errors, setErrors] = useState<Record<Key, string>>({});
  const [filling, setFilling] = useState<DayReport["gaps"][number] | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  // Bumped after a change so the current period loads again.
  const [epoch, setEpoch] = useState(0);
  const inflight = useRef(new Map<Key, Promise<void>>());
  const tz = useRef("UTC");
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const toastId = useRef(0);

  useEffect(() => {
    // The device's date and zone are only known in the browser.
    tz.current = userTz();
    const t = todayStr();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToday(t);
    setDate((d) => d ?? t);
    api.buckets().then(setBuckets, () => setBuckets([]));
  }, []);

  const fetchKey = useCallback((v: View, d: string) => {
    const key = keyFor(v, d);
    if (inflight.current.has(key)) return inflight.current.get(key)!;
    const load =
      v === "day"
        ? api.dayReport(d, tz.current)
        : v === "week"
          ? api.rangeReport(weekStart(d), addDays(weekStart(d), 6), tz.current)
          : api.rangeReport(monthRange(d).from, monthRange(d).to, tz.current);
    const p = load.then(
      (data) => {
        setCache((c) => ({ ...c, [key]: data }));
        setErrors((e) => {
          const { [key]: _gone, ...rest } = e;
          return rest;
        });
      },
      (err: Error) => {
        inflight.current.delete(key);
        setErrors((e) => ({ ...e, [key]: err.message }));
      },
    );
    inflight.current.set(key, p);
    return p;
  }, []);

  // Load the current period, then quietly fetch its neighbors so a swipe is instant.
  useEffect(() => {
    if (!date || !today) return;
    void fetchKey(view, date).then(() => {
      void fetchKey(view, shift(view, date, -1));
      if (shift(view, date, 1) <= today) void fetchKey(view, shift(view, date, 1));
    });
    const url = new URL(window.location.href);
    url.searchParams.set("view", view);
    url.searchParams.set("date", date);
    window.history.replaceState(null, "", url);
  }, [view, date, today, fetchKey, epoch]);

  const invalidate = useCallback(() => {
    inflight.current.clear();
    setCache({});
    setEpoch((e) => e + 1);
  }, []);

  const go = (dir: -1 | 1) => {
    if (!date || !today) return;
    const next = shift(view, date, dir);
    if (dir === 1 && next > today) return;
    setDate(next);
  };

  const byId = useMemo(() => new Map((buckets ?? []).map((b) => [b.id, b])), [buckets]);

  if (!date || !today) return <div aria-busy className="skeleton mt-10 h-96" />;

  const key = keyFor(view, date);
  const data = cache[key];
  const error = errors[key];
  const atEnd = shift(view, date, 1) > today;

  const title =
    view === "day"
      ? date === today
        ? "Today"
        : date === addDays(today, -1)
          ? "Yesterday"
          : dayLabel(date)
      : view === "week"
        ? `${shortLabel(weekStart(date))} to ${shortLabel(addDays(weekStart(date), 6))}`
        : monthLabel(date);

  return (
    <section
      className="mx-auto max-w-2xl pt-4"
      style={{ touchAction: "pan-y" }}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse") return;
        swipe.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const s = swipe.current;
        swipe.current = null;
        if (!s) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx > 0 ? -1 : 1);
      }}
    >
      <BackHome />
      <h1 className="mt-3 text-[28px] font-semibold">Reports</h1>

      <div role="tablist" aria-label="Period" className="glass mt-4 grid grid-cols-3 gap-1 p-1">
        {(["day", "week", "month"] as const).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={`min-h-11 rounded-2xl font-medium capitalize ${view === v ? "bg-fill-3 text-ink" : "text-ink-2"}`}
          >
            {v}
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          aria-label={`Previous ${view}`}
          onClick={() => go(-1)}
          className="glass press min-h-12 min-w-12 text-xl"
        >
          ‹
        </button>
        <h2 data-testid="report-title" className="flex-1 text-center text-lg font-semibold">
          {title}
        </h2>
        <button
          type="button"
          aria-label={`Next ${view}`}
          disabled={atEnd}
          onClick={() => go(1)}
          className="glass press min-h-12 min-w-12 text-xl disabled:opacity-30"
        >
          ›
        </button>
      </div>
      <label className="mt-2 flex items-center justify-center gap-2 text-sm text-ink-2">
        Jump to
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="min-h-10 rounded-xl border border-glass-border bg-fill px-2 text-ink"
        />
      </label>

      <div className="mt-4" data-testid="report-body" data-key={key} data-ready={data ? "true" : "false"}>
        {error ? (
          <div className="glass p-5">
            <p>We couldn&apos;t load this report. {error}</p>
            <button
              type="button"
              onClick={() => void fetchKey(view, date)}
              className="mt-3 min-h-12 rounded-xl bg-fill-2 px-5"
            >
              Retry
            </button>
          </div>
        ) : !data || !buckets ? (
          <div aria-busy className="skeleton h-72" />
        ) : view === "day" ? (
          <DayView report={data as DayReport} byId={byId} onFill={setFilling} />
        ) : (
          <RangeView
            report={data as RangeReport}
            buckets={buckets}
            byId={byId}
            period={view}
            onOpenDay={(d) => {
              setView("day");
              setDate(d);
            }}
          />
        )}
      </div>

      {filling && buckets && (
        <FillSheet
          gap={filling}
          buckets={buckets.filter((b) => !b.archivedAt)}
          onClose={() => setFilling(null)}
          onPick={async (b) => {
            try {
              await api.createEntry({
                bucketId: b.id,
                startAt: filling.startAt,
                endAt: filling.endAt,
                clientId: newClientId(),
              });
              setFilling(null);
              invalidate();
              toastId.current += 1;
              setToast({ id: toastId.current, message: `Nice. ${formatMinutes(filling.minutes)} of ${b.name} logged.`, ms: 3000 });
            } catch (e) {
              toastId.current += 1;
              setToast({ id: toastId.current, tone: "error", message: (e as Error).message });
            }
          }}
        />
      )}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </section>
  );
}

/* --------------------------------- Day ---------------------------------- */

function DayView({
  report,
  byId,
  onFill,
}: {
  report: DayReport;
  byId: Map<string, ClientBucket>;
  onFill: (g: DayReport["gaps"][number]) => void;
}) {
  if (report.total === 0 && report.entries.length === 0) {
    return <p className="glass p-5 text-ink-2">Nothing tracked this day.</p>;
  }

  const work = report.buckets
    .filter((b) => byId.get(b.bucketId)?.group === "work")
    .reduce((s, b) => s + b.minutes, 0);
  const life = report.total - work;
  const overlaps = new Set(report.overlaps);

  type Item =
    | { kind: "entry"; at: number; e: DayReport["entries"][number] }
    | { kind: "gap"; at: number; g: DayReport["gaps"][number] };
  const items: Item[] = [
    ...report.entries.map((e) => ({ kind: "entry" as const, at: e.startAt.getTime(), e })),
    ...report.gaps.map((g) => ({ kind: "gap" as const, at: g.startAt.getTime(), g })),
  ].sort((a, b) => a.at - b.at);

  return (
    <div className="flex flex-col gap-4">
      <div className="glass p-5">
        <p className="text-sm text-ink-2">Tracked</p>
        <p data-testid="report-total" className="tabular text-[28px] font-semibold">
          {formatMinutes(report.total)}
        </p>
        {report.total > 0 && (
          <>
            <div className="mt-3 flex h-3 gap-[2px] overflow-hidden rounded-full" aria-hidden>
              {work > 0 && <div className="h-full rounded-l-full bg-ink" style={{ flexGrow: work }} />}
              {life > 0 && <div className="h-full rounded-r-full bg-ink-2/60" style={{ flexGrow: life }} />}
            </div>
            <p className="mt-2 flex justify-between text-sm">
              <span>
                <span aria-hidden className="mr-1.5 inline-block h-2 w-2 rounded-full bg-ink" />
                Work {formatMinutes(work)}
              </span>
              <span>
                <span aria-hidden className="mr-1.5 inline-block h-2 w-2 rounded-full bg-ink-2/60" />
                Life {formatMinutes(life)}
              </span>
            </p>
          </>
        )}
      </div>

      <div className="glass p-5">
        <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-2">By bucket</h3>
        <ul className="flex flex-col gap-3" data-testid="breakdown">
          {report.buckets.map((b) => {
            const bucket = byId.get(b.bucketId);
            const pct = report.total ? Math.round((b.minutes / report.total) * 100) : 0;
            return (
              <li key={b.bucketId}>
                <div className="flex items-center gap-2">
                  <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: bucket?.color }} />
                  <span className="flex-1">{bucket?.name ?? "Deleted bucket"}</span>
                  <span className="tabular">{formatMinutes(b.minutes)}</span>
                  <span className="tabular w-11 text-right text-ink-2">{pct}%</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-fill-2" aria-hidden>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: bucket?.color }} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-2">Timeline</h3>
        <ol className="flex flex-col gap-2" data-testid="report-timeline">
          {items.map((it) => {
            if (it.kind === "gap") {
              const g = it.g;
              return (
                <li key={`gap-${it.at}`}>
                  <button
                    type="button"
                    data-testid="untracked"
                    onClick={() => onFill(g)}
                    className="press flex w-full items-center gap-3 rounded-[20px] border-2 border-dashed border-glass-border p-4 text-left"
                    style={{ minHeight: Math.min(160, Math.max(56, g.minutes * 0.6)) }}
                  >
                    <span className="flex-1">
                      <span className="block font-medium">Untracked {formatMinutes(g.minutes)}</span>
                      <span className="block text-sm text-ink-2">
                        {fmtTime(g.startAt)} to {fmtTime(g.endAt)}. Tap to fill
                      </span>
                    </span>
                    <span aria-hidden className="text-xl text-ink-2">+</span>
                  </button>
                </li>
              );
            }
            const e = it.e;
            const bucket = byId.get(e.bucketId);
            const minutes = e.endAt ? Math.round((e.endAt.getTime() - e.startAt.getTime()) / 60_000) : 0;
            return (
              <li
                key={e.id}
                data-testid="report-entry"
                className="glass flex items-center gap-3 p-4"
                style={{ minHeight: Math.min(240, Math.max(56, minutes * 0.8)) }}
              >
                <span aria-hidden className="w-1.5 self-stretch rounded-full" style={{ background: bucket?.color }} />
                <span className="flex-1">
                  <span className="flex items-center gap-1.5 font-medium">
                    {bucket?.name ?? "Deleted bucket"}
                    {e.source === "calendar" && (
                      <svg aria-label="From calendar" role="img" viewBox="0 0 24 24" className="h-4 w-4 text-ink-2" fill="none" stroke="currentColor" strokeWidth={2}>
                        <rect x="3" y="5" width="18" height="16" rx="2" />
                        <path d="M3 10h18M8 3v4M16 3v4" />
                      </svg>
                    )}
                  </span>
                  <span className="tabular block text-sm text-ink-2">
                    {fmtTime(e.startAt)} to {e.endAt ? fmtTime(e.endAt) : "now"}
                    {e.note ? ` · ${e.note}` : ""}
                  </span>
                  {overlaps.has(e.id) && (
                    <span data-testid="overlap" className="mt-1 inline-flex items-center gap-1 rounded-full bg-fill-3 px-2 py-0.5 text-xs font-medium">
                      <span aria-hidden>⚠</span> Overlaps another entry
                    </span>
                  )}
                </span>
                <span className="tabular text-ink-2">{e.endAt ? formatMinutes(minutes) : "Running"}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

/* ----------------------------- Week and month ---------------------------- */

function changeText(change: number, period: "week" | "month") {
  if (change === 0) return `same as last ${period}`;
  return `${change > 0 ? "up" : "down"} ${formatMinutes(Math.abs(change))} vs last ${period}`;
}

function RangeView({
  report,
  buckets,
  byId,
  period,
  onOpenDay,
}: {
  report: RangeReport;
  buckets: ClientBucket[];
  byId: Map<string, ClientBucket>;
  period: "week" | "month";
  onOpenDay: (date: string) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(60, ...report.days.map((d) => d.total));
  // Stack in the bucket order from Settings so a color always sits in the same place.
  const order = buckets.map((b) => b.id);
  const present = order.filter((id) => report.buckets.some((b) => b.bucketId === id && b.total > 0));
  const dense = report.days.length > 7;
  const h = hover !== null ? report.days[hover] : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="glass p-5">
        <p className="text-sm text-ink-2">Tracked this {period}</p>
        <p data-testid="report-total" className="tabular text-[28px] font-semibold">
          {formatMinutes(report.total)}
        </p>
        <p className="text-sm text-ink-2">{changeText(report.total - report.previousTotal, period)}</p>
      </div>

      <div className="glass p-5">
        {present.length > 0 && (
          <ul className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Legend">
            {present.map((id) => (
              <li key={id} className="flex items-center gap-1.5">
                <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: byId.get(id)?.color }} />
                {byId.get(id)?.name}
              </li>
            ))}
          </ul>
        )}

        <div className="relative">
          {h && (
            <div
              role="tooltip"
              className="pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 -translate-y-full rounded-xl border border-glass-border bg-surface px-3 py-2 text-sm shadow-xl"
            >
              <p className="font-medium">{dayLabel(h.date)}. {formatMinutes(h.total)}</p>
              {order
                .filter((id) => h.buckets[id])
                .map((id) => (
                  <p key={id} className="flex items-center gap-1.5 text-ink-2">
                    <span aria-hidden className="h-2 w-2 rounded-sm" style={{ background: byId.get(id)?.color }} />
                    <span className="text-ink">{byId.get(id)?.name}</span> {formatMinutes(h.buckets[id])}
                  </p>
                ))}
            </div>
          )}
          <div className={`flex h-40 items-end ${dense ? "gap-[2px]" : "gap-2"}`} data-testid="bars">
            {report.days.map((d, i) => (
              <button
                key={d.date}
                type="button"
                aria-label={`${dayLabel(d.date)}. ${formatMinutes(d.total)}. Open day`}
                onClick={() => onOpenDay(d.date)}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="flex h-full flex-1 flex-col-reverse gap-[2px] rounded-t-[4px] hover:bg-fill focus-visible:bg-fill"
              >
                {order
                  .filter((id) => d.buckets[id])
                  .map((id, j, arr) => (
                    <span
                      key={id}
                      className={`block w-full ${j === arr.length - 1 ? "rounded-t-[4px]" : ""}`}
                      style={{ height: `${(d.buckets[id] / max) * 100}%`, background: byId.get(id)?.color }}
                    />
                  ))}
              </button>
            ))}
          </div>
        </div>
        <div className={`mt-1.5 flex text-center text-xs text-ink-2 ${dense ? "gap-[2px]" : "gap-2"}`} aria-hidden>
          {report.days.map((d, i) => (
            <span key={d.date} className="flex-1">
              {dense ? (i % 7 === 0 ? Number(d.date.slice(8)) : "") : weekdayInitial(d.date)}
            </span>
          ))}
        </div>
      </div>

      <div className="glass p-5">
        <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-ink-2">By bucket</h3>
        {report.buckets.length === 0 ? (
          <p className="text-ink-2">Nothing tracked this {period}.</p>
        ) : (
          <table className="w-full text-left" data-testid="range-table">
            <thead className="text-xs text-ink-2">
              <tr>
                <th className="pb-2 font-medium">Bucket</th>
                <th className="pb-2 text-right font-medium">Total</th>
                <th className="pb-2 text-right font-medium">Per day</th>
              </tr>
            </thead>
            <tbody>
              {report.buckets.map((b) => {
                const bucket = byId.get(b.bucketId);
                return (
                  <tr key={b.bucketId} className="border-t border-glass-border align-top">
                    <td className="py-2">
                      <span className="flex items-center gap-2">
                        <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: bucket?.color }} />
                        {bucket?.name ?? "Deleted bucket"}
                      </span>
                      <span className="block pl-4.5 text-xs text-ink-2">{changeText(b.change, period)}</span>
                    </td>
                    <td className="tabular py-2 text-right">{formatMinutes(b.total)}</td>
                    <td className="tabular py-2 text-right text-ink-2">{formatMinutes(b.dailyAverage)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ Fill a gap ------------------------------ */

function FillSheet({
  gap,
  buckets,
  onClose,
  onPick,
}: {
  gap: DayReport["gaps"][number];
  buckets: ClientBucket[];
  onClose: () => void;
  onPick: (b: ClientBucket) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="fade-in fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Fill untracked time"
        onClick={(e) => e.stopPropagation()}
        className="sheet-in mx-auto w-full max-w-md rounded-t-[24px] border border-glass-border bg-surface p-5 pb-[max(20px,env(safe-area-inset-bottom))]"
      >
        <h2 className="text-lg font-semibold">Fill {formatMinutes(gap.minutes)}</h2>
        <p className="text-sm text-ink-2">
          {fmtTime(gap.startAt)} to {fmtTime(gap.endAt)}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {buckets.map((b) => (
            <button
              key={b.id}
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await onPick(b);
                setBusy(false);
              }}
              className="press flex min-h-14 items-center gap-2 rounded-2xl border border-glass-border bg-fill px-4 text-left"
            >
              <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: b.color }} />
              {b.name}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} className="mt-4 min-h-12 w-full rounded-xl bg-fill-2">
          Cancel
        </button>
      </div>
    </div>
  );
}
