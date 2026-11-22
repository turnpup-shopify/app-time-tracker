"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QUICK_DURATIONS, UNDO_MS } from "@/lib/defaults";
import { formatMinutes, localDayRange, minutesWithin, quickLogRange } from "@/lib/time";
import {
  api,
  ApiError,
  atTime,
  fmtClock,
  haptic,
  newClientId,
  toTimeInput,
  type ClientBucket,
  type ClientEntry,
} from "@/lib/client";
import { flyDot } from "@/lib/motion";
import { dequeue, enqueue, readQueue, type QueuedEntry } from "@/lib/offline";
import { useNow } from "@/lib/useNow";
import { DayRing } from "./DayRing";
import { EntrySheet } from "./EntrySheet";
import { Timeline } from "./Timeline";
import { Toast, type ToastState } from "./Toast";

type EndedAt = { kind: "now" } | { kind: "ago"; minutes: number } | { kind: "at"; time: string };

const DOUBLE_TAP_MS = 800;
const FLUSH_EVERY_MS = 15_000;

const tempIdFor = (clientId: string) => `tmp-${clientId}`;

const fromQueue = (q: QueuedEntry): ClientEntry => ({
  id: tempIdFor(q.clientId),
  clientId: q.clientId,
  bucketId: q.bucketId,
  startAt: new Date(q.startAt),
  endAt: new Date(q.endAt),
  source: "manual",
  note: q.note ?? null,
  offline: true,
});

export function TodayView() {
  const [day] = useState(() => localDayRange(new Date()));
  const [buckets, setBuckets] = useState<ClientBucket[] | null>(null);
  const [entries, setEntries] = useState<ClientEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [endedAt, setEndedAt] = useState<EndedAt>({ kind: "now" });
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pulse, setPulse] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [editing, setEditing] = useState<ClientEntry | null>(null);
  const lastTap = useRef<{ key: string; at: number } | null>(null);
  const toastId = useRef(0);
  const flushing = useRef(false);

  const showToast = useCallback((t: Omit<NonNullable<ToastState>, "id">) => {
    toastId.current += 1;
    setToast({ ...t, id: toastId.current });
  }, []);
  const closeToast = useCallback(() => setToast(null), []);

  /** Sends entries saved offline. Safe to call often. Client ids stop duplicates. */
  const flushQueue = useCallback(async () => {
    if (flushing.current) return;
    const queue = readQueue();
    if (!queue.length) return;
    flushing.current = true;
    let synced = 0;
    try {
      for (const item of queue) {
        try {
          const saved = await api.createEntry({
            bucketId: item.bucketId,
            startAt: new Date(item.startAt),
            endAt: new Date(item.endAt),
            note: item.note,
            clientId: item.clientId,
          });
          dequeue(item.clientId);
          synced++;
          setEntries((xs) => xs.map((x) => (x.id === tempIdFor(item.clientId) ? saved : x)));
        } catch (err) {
          // Still offline or the server is struggling. Keep it and try later.
          if (err instanceof ApiError && (err.status === 0 || err.status === 401 || err.status >= 500)) {
            break;
          }
          // The server said no (for example the bucket was deleted). Drop it and say so.
          dequeue(item.clientId);
          setEntries((xs) => xs.filter((x) => x.id !== tempIdFor(item.clientId)));
          showToast({ tone: "error", message: `An offline entry couldn't be saved. ${(err as Error).message}` });
        }
      }
    } finally {
      flushing.current = false;
    }
    if (synced) {
      showToast({
        message: `Back online. ${synced} offline ${synced === 1 ? "entry" : "entries"} synced.`,
        ms: 3000,
      });
    }
  }, [showToast]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [b, e] = await Promise.all([api.buckets(), api.entries(day.from, day.to)]);
      // Show entries still waiting to sync. Drop any the server already has.
      const onServer = new Set(e.map((x) => x.clientId).filter(Boolean));
      const waiting = readQueue().filter((q) => {
        if (!onServer.has(q.clientId)) return true;
        dequeue(q.clientId);
        return false;
      });
      const inDay = waiting
        .map(fromQueue)
        .filter((x) => x.startAt < day.to && (x.endAt ?? x.startAt) > day.from);
      setBuckets(b);
      setEntries([...e, ...inDay]);
      void flushQueue();
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }, [day, flushQueue]);

  useEffect(() => {
    // Initial data load for the day.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    const onOnline = () => void flushQueue();
    window.addEventListener("online", onOnline);
    const id = setInterval(onOnline, FLUSH_EVERY_MS);
    return () => {
      window.removeEventListener("online", onOnline);
      clearInterval(id);
    };
  }, [flushQueue]);

  const running = entries.find((e) => !e.endAt) ?? null;
  const now = useNow(1000, !!running);

  const bucketById = useMemo(
    () => new Map((buckets ?? []).map((b) => [b.id, b])),
    [buckets],
  );
  const active = useMemo(() => (buckets ?? []).filter((b) => !b.archivedAt), [buckets]);

  // A running timer grows the ring. Recomputing once a minute is enough.
  const minuteTick = running && now ? Math.floor(now / 60_000) : 0;
  const slices = useMemo(() => {
    const at = minuteTick ? new Date(minuteTick * 60_000) : undefined;
    const per = new Map<string, number>();
    for (const e of entries) {
      const m = minutesWithin(e, day.from, day.to, at);
      per.set(e.bucketId, (per.get(e.bucketId) ?? 0) + m);
    }
    return (buckets ?? [])
      .filter((b) => per.get(b.id))
      .map((b) => ({ id: b.id, color: b.color, minutes: per.get(b.id)! }));
  }, [entries, buckets, day, minuteTick]);

  function resolveEnd(): Date {
    const now = new Date();
    if (endedAt.kind === "ago") return new Date(now.getTime() - endedAt.minutes * 60_000);
    if (endedAt.kind === "at") return atTime(now, endedAt.time);
    return now;
  }

  async function save(
    bucket: ClientBucket,
    minutes: number,
    range: { startAt: Date; endAt: Date },
    clientId: string,
    noteText: string,
  ) {
    const tempId = `tmp-${clientId}`;
    setEntries((xs) =>
      xs.some((x) => x.id === tempId)
        ? xs
        : [
            ...xs,
            {
              id: tempId,
              clientId,
              bucketId: bucket.id,
              ...range,
              source: "manual",
              note: noteText || null,
              pending: true,
            },
          ],
    );
    try {
      const saved = await api.createEntry({
        bucketId: bucket.id,
        ...range,
        note: noteText,
        clientId,
      });
      setEntries((xs) => xs.map((x) => (x.id === tempId ? saved : x)));
      showToast({
        message: `Nice. ${formatMinutes(minutes)} of ${bucket.name} logged.`,
        actionLabel: "Undo",
        ms: UNDO_MS,
        onAction: () => void undoLog(saved),
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) {
        // No connection. Keep it on this phone and sync later.
        enqueue({
          clientId,
          bucketId: bucket.id,
          startAt: range.startAt.toISOString(),
          endAt: range.endAt.toISOString(),
          note: noteText || undefined,
          queuedAt: new Date().toISOString(),
        });
        const offlineEntry: ClientEntry = {
          id: tempId,
          clientId,
          bucketId: bucket.id,
          ...range,
          source: "manual",
          note: noteText || null,
          offline: true,
        };
        setEntries((xs) => xs.map((x) => (x.id === tempId ? offlineEntry : x)));
        showToast({
          message: `Saved offline. ${formatMinutes(minutes)} of ${bucket.name} syncs when you're back online.`,
          actionLabel: "Undo",
          ms: UNDO_MS,
          onAction: () => void undoLog(offlineEntry),
        });
        return;
      }
      setEntries((xs) => xs.filter((x) => x.id !== tempId));
      showToast({
        tone: "error",
        message: (err as Error).message,
        actionLabel: "Retry",
        ms: 10_000,
        // Same client id, so a retry after a lost response never duplicates.
        onAction: () => void save(bucket, minutes, range, clientId, noteText),
      });
    }
  }

  function log(bucket: ClientBucket, minutes: number, tapAt: number, chip: Element) {
    const key = `${bucket.id}:${minutes}`;
    const now = tapAt;
    if (lastTap.current && lastTap.current.key === key && now - lastTap.current.at < DOUBLE_TAP_MS) {
      return;
    }
    lastTap.current = { key, at: now };

    haptic();
    flyDot(chip, "day-ring", bucket.color);
    setPulse(bucket.id);
    setTimeout(() => setPulse((p) => (p === bucket.id ? null : p)), 350);

    const range = quickLogRange(minutes, resolveEnd());
    const noteText = note.trim();
    setExpanded(null);
    setNote("");
    setNoteOpen(false);
    setEndedAt({ kind: "now" });
    void save(bucket, minutes, range, newClientId(), noteText);
  }

  async function undoLog(entry: ClientEntry) {
    setEntries((xs) => xs.filter((x) => x.id !== entry.id));
    if (entry.offline && entry.clientId) {
      dequeue(entry.clientId);
      return;
    }
    try {
      await api.deleteEntry(entry.id);
    } catch (err) {
      setEntries((xs) => [...xs, entry]);
      showToast({ tone: "error", message: (err as Error).message });
    }
  }

  async function remove(entry: ClientEntry) {
    if (entry.pending) return;
    if (entry.offline) {
      await undoLog(entry);
      showToast({ message: "Removed the offline entry.", ms: 2500 });
      return;
    }
    setEntries((xs) => xs.filter((x) => x.id !== entry.id));
    try {
      await api.deleteEntry(entry.id);
      const b = bucketById.get(entry.bucketId);
      showToast({
        message: `Deleted ${b?.name ?? "entry"}.`,
        actionLabel: "Undo",
        ms: UNDO_MS,
        onAction: async () => {
          try {
            const restored = await api.restoreEntry(entry.id);
            setEntries((xs) => [...xs, restored]);
          } catch (err) {
            showToast({ tone: "error", message: (err as Error).message });
          }
        },
      });
    } catch (err) {
      setEntries((xs) => [...xs, entry]);
      showToast({ tone: "error", message: (err as Error).message });
    }
  }

  async function saveEdit(
    entry: ClientEntry,
    patch: { bucketId?: string; startAt?: Date; endAt?: Date; note?: string | null },
  ) {
    const updated = await api.updateEntry(entry.id, patch);
    setEntries((xs) => xs.map((x) => (x.id === entry.id ? updated : x)));
    setEditing(null);
    showToast({ message: "Saved.", ms: 2500 });
  }

  if (loadError) {
    return (
      <div className="glass mt-10 p-5">
        <p className="text-ink">We couldn&apos;t load today. {loadError}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 min-h-12 rounded-xl bg-fill-2 px-5 font-medium text-ink"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!buckets) {
    return (
      <div aria-busy className="pt-6">
        <div className="skeleton mx-auto h-48 w-48 rounded-full!" />
        <div className="mt-8 grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-24" />
          ))}
        </div>
      </div>
    );
  }

  const sorted = [...entries].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  return (
    <section className="pt-4">
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-[28px] font-semibold">Today</h1>
        <span className="text-ink-2">
          {day.from.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}
        </span>
      </header>

      {running && (
        <Link
          href="/timer"
          data-testid="running-pill"
          className="glass press mb-4 flex min-h-12 items-center gap-2 px-4 text-sm"
        >
          <span aria-hidden className="h-2.5 w-2.5 animate-pulse rounded-full" style={{ background: bucketById.get(running.bucketId)?.color }} />
          <span className="flex-1">
            Timer running. {bucketById.get(running.bucketId)?.name ?? "Entry"}
          </span>
          <span className="tabular font-semibold">{now ? fmtClock(now - running.startAt.getTime()) : ""}</span>
        </Link>
      )}

      <DayRing slices={slices} />

      {entries.length === 0 && (
        <p className="mt-4 text-center text-ink-2">Tap a bucket to log time</p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3">
        {active.map((b) => {
          const isOpen = expanded === b.id;
          const mins = slices.find((s) => s.id === b.id)?.minutes ?? 0;
          return (
            <div
              key={b.id}
              data-testid={`bucket-${b.name}`}
              className={`glass overflow-hidden transition-transform ${
                isOpen ? "col-span-2" : ""
              } ${pulse === b.id ? "pulse-once" : ""}`}
              style={{ boxShadow: `inset 4px 0 0 ${b.color}` }}
            >
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setExpanded(isOpen ? null : b.id)}
                className="press flex min-h-24 w-full flex-col items-start justify-between p-4 text-left"
              >
                <span className="flex items-center gap-2 font-medium">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: b.color }}
                  />
                  {b.name}
                </span>
                <span className="tabular text-ink-2">{mins ? formatMinutes(mins) : "0m"}</span>
              </button>

              {isOpen && (
                <div className="expand-in px-4 pb-4">
                  <div className="grid grid-cols-4 gap-2" role="group" aria-label={`Log ${b.name}`}>
                    {QUICK_DURATIONS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={(e) => log(b, m, e.timeStamp, e.currentTarget)}
                        className="min-h-12 rounded-full border border-glass-border bg-fill-2 font-semibold text-ink press"
                      >
                        {formatMinutes(m)}
                      </button>
                    ))}
                  </div>

                  <EndedAtPicker value={endedAt} onChange={setEndedAt} />

                  {noteOpen ? (
                    <input
                      autoFocus
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={500}
                      placeholder="Note (optional)"
                      aria-label="Note"
                      className="mt-3 min-h-12 w-full rounded-xl border border-glass-border bg-fill px-3 text-ink placeholder:text-ink-2"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setNoteOpen(true)}
                      className="mt-2 min-h-12 text-sm text-ink-2 underline underline-offset-4"
                    >
                      Add note
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <h2 className="mt-8 mb-3 text-sm font-medium uppercase tracking-wide text-ink-2">Timeline</h2>
      <Timeline
        entries={sorted}
        buckets={bucketById}
        onDelete={remove}
        onEdit={(e) => {
          if (e.offline || e.pending) {
            showToast({ message: "This entry is still syncing. You can edit it once it's saved.", ms: 3000 });
            return;
          }
          setEditing(e);
        }}
      />

      {editing && (
        <EntrySheet
          entry={editing}
          buckets={buckets}
          onClose={() => setEditing(null)}
          onSave={(patch) => saveEdit(editing, patch)}
          onDelete={() => {
            setEditing(null);
            void remove(editing);
          }}
        />
      )}

      <Toast toast={toast} onClose={closeToast} />
    </section>
  );
}

function EndedAtPicker({
  value,
  onChange,
}: {
  value: EndedAt;
  onChange: (v: EndedAt) => void;
}) {
  const options: { label: string; v: EndedAt }[] = [
    { label: "Now", v: { kind: "now" } },
    { label: "30m ago", v: { kind: "ago", minutes: 30 } },
    { label: "1h ago", v: { kind: "ago", minutes: 60 } },
  ];
  const same = (a: EndedAt, b: EndedAt) =>
    a.kind === b.kind && (a.kind !== "ago" || a.minutes === (b as { minutes: number }).minutes);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Ended at">
      <span className="text-ink-2">Ended at</span>
      {options.map((o) => (
        <button
          key={o.label}
          type="button"
          aria-pressed={same(value, o.v)}
          onClick={() => onChange(o.v)}
          className={`min-h-10 rounded-full px-3 ${
            same(value, o.v) ? "bg-fill-3 text-ink" : "bg-fill text-ink-2"
          }`}
        >
          {o.label}
        </button>
      ))}
      <input
        type="time"
        aria-label="Ended at time"
        value={value.kind === "at" ? value.time : ""}
        onChange={(e) =>
          onChange(e.target.value ? { kind: "at", time: e.target.value } : { kind: "now" })
        }
        onFocus={(e) => {
          if (!e.target.value) onChange({ kind: "at", time: toTimeInput(new Date()) });
        }}
        className={`min-h-10 rounded-full px-3 text-ink ${
          value.kind === "at" ? "bg-fill-3" : "bg-fill"
        }`}
      />
    </div>
  );
}
