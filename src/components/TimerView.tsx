"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, fmtClock, haptic, newClientId, type ClientBucket, type ClientEntry, type StopResult } from "@/lib/client";
import { formatMinutes } from "@/lib/time";
import { useNow } from "@/lib/useNow";
import { Toast, type ToastState } from "./Toast";
import { BackHome } from "@/components/BackHome";

const minutesOf = (e: ClientEntry) =>
  e.endAt ? Math.round((e.endAt.getTime() - e.startAt.getTime()) / 60_000) : 0;

export function TimerView() {
  const [buckets, setBuckets] = useState<ClientBucket[] | null>(null);
  const [timer, setTimer] = useState<ClientEntry | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const toastId = useRef(0);
  const now = useNow(1000, !!timer);

  const showToast = useCallback((t: Omit<NonNullable<ToastState>, "id">) => {
    toastId.current += 1;
    setToast({ ...t, id: toastId.current });
  }, []);
  const closeToast = useCallback(() => setToast(null), []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [b, t] = await Promise.all([api.buckets(), api.timer()]);
      setBuckets(b);
      setTimer(t);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    // Initial load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // Another device may have started or stopped the timer while this tab slept.
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const name = (id: string) => buckets?.find((b) => b.id === id)?.name ?? "Entry";

  function describeStop(r: StopResult): string | null {
    if (r.status === "logged") {
      const capped = r.capped ? " Capped at 24h." : "";
      return `Nice. ${formatMinutes(minutesOf(r.entry))} of ${name(r.entry.bucketId)} logged.${capped}`;
    }
    if (r.status === "discarded") return "Under 1 minute, so nothing was logged.";
    return null;
  }

  async function start(bucketId: string) {
    if (busy) return;
    setBusy(true);
    haptic();
    try {
      const { timer: t, stopped } = await api.startTimer(bucketId, newClientId());
      setTimer(t);
      setPicked(null);
      const msg = describeStop(stopped);
      showToast({ message: msg ? `${msg} ${name(bucketId)} started.` : `${name(bucketId)} started.` });
    } catch (e) {
      showToast({ tone: "error", message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (busy) return;
    setBusy(true);
    haptic();
    try {
      const r = await api.stopTimer();
      setTimer(null);
      showToast({ message: describeStop(r) ?? "No timer was running." });
    } catch (e) {
      showToast({ tone: "error", message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="glass mt-10 p-5">
        <p>We couldn&apos;t load the timer. {loadError}</p>
        <button type="button" onClick={() => void load()} className="mt-4 min-h-12 rounded-xl bg-fill-2 px-5 font-medium">
          Retry
        </button>
      </div>
    );
  }
  if (!buckets) return <div aria-busy className="skeleton mt-10 h-72" />;

  const active = buckets.filter((b) => !b.archivedAt);
  const running = timer ? buckets.find((b) => b.id === timer.bucketId) : null;
  const elapsed = timer && now ? now - timer.startAt.getTime() : 0;

  return (
    <section className="mx-auto max-w-md pt-4">
      <BackHome />
      <h1 className="mt-3 mb-6 text-[28px] font-semibold">Timer</h1>

      {timer ? (
        <div className="glass p-6 text-center" style={{ boxShadow: `inset 0 4px 0 ${running?.color ?? "#888"}` }}>
          <p className="flex items-center justify-center gap-2 font-medium">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: running?.color }} />
            {running?.name ?? "Unknown bucket"}
          </p>
          <p
            data-testid="timer-clock"
            data-start={timer.startAt.toISOString()}
            className="tabular mt-3 text-[56px] font-semibold leading-none"
            role="timer"
            aria-label={`Running for ${fmtClock(elapsed)}`}
          >
            {fmtClock(elapsed)}
          </p>
          <p className="mt-2 text-sm text-ink-2">
            Started {timer.startAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </p>
          <button
            type="button"
            onClick={() => void stop()}
            disabled={busy}
            className="press mt-6 min-h-14 w-full rounded-2xl bg-danger-bg text-lg font-semibold text-white disabled:opacity-60"
          >
            Stop
          </button>
        </div>
      ) : (
        <div className="glass p-5">
          <p className="mb-3 text-ink-2">Pick a bucket</p>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Bucket">
            {active.map((b) => (
              <button
                key={b.id}
                type="button"
                role="radio"
                aria-checked={picked === b.id}
                onClick={() => setPicked(b.id)}
                className={`press flex min-h-14 items-center gap-2 rounded-2xl border px-4 text-left ${
                  picked === b.id ? "border-ink bg-fill-3" : "border-glass-border bg-fill"
                }`}
              >
                <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: b.color }} />
                {b.name}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={!picked || busy}
            onClick={() => picked && void start(picked)}
            className="press mt-5 min-h-14 w-full rounded-2xl bg-accent text-lg font-semibold text-on-accent disabled:opacity-50"
          >
            Start
          </button>
        </div>
      )}

      {timer && (
        <>
          <h2 className="mt-8 mb-3 text-sm font-medium uppercase tracking-wide text-ink-2">Switch to</h2>
          <div className="grid grid-cols-2 gap-2">
            {active
              .filter((b) => b.id !== timer.bucketId)
              .map((b) => (
                <button
                  key={b.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void start(b.id)}
                  className="glass press flex min-h-14 items-center gap-2 px-4 text-left"
                >
                  <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: b.color }} />
                  {b.name}
                </button>
              ))}
          </div>
          <p className="mt-3 text-sm text-ink-2">Switching stops and logs the current timer.</p>
        </>
      )}

      <Toast toast={toast} onClose={closeToast} />
    </section>
  );
}
