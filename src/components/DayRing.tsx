"use client";

import { useEffect, useState } from "react";
import { DAY_START_HOUR, DAY_TARGET_MIN as TARGET_MIN } from "@/lib/defaults";
import { useRollingNumber } from "@/lib/motion";
import { formatMinutes, upToLabel } from "@/lib/time";

const R = 70;
const C = 2 * Math.PI * R;

/** Compact day summary. Ring on the left, the numbers that matter on the right. */
export function DayRing({
  slices,
  groups,
}: {
  slices: { color: string; minutes: number; id: string }[];
  groups: { work: number; life: number };
}) {
  const total = slices.reduce((s, x) => s + x.minutes, 0);
  const shown = useRollingNumber(total);
  const left = Math.max(0, TARGET_MIN - total);

  // Slices start at zero length and grow in on the first frame.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const arcs = slices.map((s) => ({
    ...s,
    len: ready ? (Math.min(s.minutes, TARGET_MIN) / TARGET_MIN) * C : 0,
  }));
  const offsets = arcs.map((_, i) => arcs.slice(0, i).reduce((sum, a) => sum + a.len, 0));

  return (
    <div className="glass flex items-center gap-4 p-4">
      <div
        id="day-ring"
        className="relative h-32 w-32 shrink-0"
        role="img"
        aria-label={`${formatMinutes(total)} tracked today. Counting from 8 AM, that covers up to ${upToLabel(total, DAY_START_HOUR)}`}
      >
        <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
          <circle cx="80" cy="80" r={R} fill="none" stroke="var(--color-fill-2)" strokeWidth="16" />
          {arcs.map((s, i) => (
            <circle
              key={s.id}
              className="ring-slice"
              cx="80"
              cy="80"
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth="16"
              strokeDasharray={`${s.len} ${C - s.len}`}
              strokeDashoffset={-offsets[i]}
              style={{ transition: "stroke-dasharray 300ms ease-out, stroke-dashoffset 300ms ease-out" }}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
          <span data-testid="day-total" data-total={total} className="tabular text-lg font-semibold tracking-tight">
            {formatMinutes(shown)}
          </span>
        </div>
      </div>

      <dl className="min-w-0 flex-1 text-sm" aria-hidden>
        <dt className="text-ink-2">Logged up to</dt>
        <dd data-testid="day-upto" className="tabular text-xl font-semibold leading-tight">
          {upToLabel(shown, DAY_START_HOUR)}
        </dd>
        <dd className="text-xs text-ink-2">from 8 AM · {formatMinutes(left)} left of 16h</dd>
        <div className="mt-2.5 flex gap-4">
          <div>
            <dt className="text-xs text-ink-2">Work</dt>
            <dd data-testid="day-work" className="tabular font-medium">{formatMinutes(groups.work)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-2">Life</dt>
            <dd data-testid="day-life" className="tabular font-medium">{formatMinutes(groups.life)}</dd>
          </div>
        </div>
      </dl>
    </div>
  );
}
