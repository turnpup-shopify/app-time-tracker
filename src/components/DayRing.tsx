"use client";

import { useEffect, useState } from "react";
import { useRollingNumber } from "@/lib/motion";
import { formatMinutes } from "@/lib/time";

const TARGET_MIN = 16 * 60;
const R = 70;
const C = 2 * Math.PI * R;

export function DayRing({ slices }: { slices: { color: string; minutes: number; id: string }[] }) {
  const total = slices.reduce((s, x) => s + x.minutes, 0);
  const shown = useRollingNumber(total);

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
    <div
      id="day-ring"
      className="relative mx-auto h-48 w-48"
      role="img"
      aria-label={`${formatMinutes(total)} tracked today`}
    >
      <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
        <circle cx="80" cy="80" r={R} fill="none" stroke="var(--color-fill-2)" strokeWidth="14" />
        {arcs.map((s, i) => (
          <circle
            key={s.id}
            className="ring-slice"
            cx="80"
            cy="80"
            r={R}
            fill="none"
            stroke={s.color}
            strokeWidth="14"
            strokeDasharray={`${s.len} ${C - s.len}`}
            strokeDashoffset={-offsets[i]}
            style={{
              transition: "stroke-dasharray 300ms ease-out, stroke-dashoffset 300ms ease-out",
            }}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden>
        <span data-testid="day-total" data-total={total} className="tabular text-[28px] font-semibold">
          {formatMinutes(shown)}
        </span>
        <span className="text-xs text-ink-2">of 16h day</span>
      </div>
    </div>
  );
}
