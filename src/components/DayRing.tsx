"use client";

import { formatMinutes } from "@/lib/time";

const TARGET_MIN = 16 * 60;
const R = 70;
const C = 2 * Math.PI * R;

export function DayRing({ slices }: { slices: { color: string; minutes: number; id: string }[] }) {
  const total = slices.reduce((s, x) => s + x.minutes, 0);
  const arcs = slices.map((s) => ({ ...s, len: (Math.min(s.minutes, TARGET_MIN) / TARGET_MIN) * C }));
  const offsets = arcs.map((_, i) => arcs.slice(0, i).reduce((sum, a) => sum + a.len, 0));
  return (
    <div className="relative mx-auto h-48 w-48" role="img" aria-label={`${formatMinutes(total)} tracked today`}>
      <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
        <circle cx="80" cy="80" r={R} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="14" />
        {arcs.map((s, i) => (
            <circle
              key={s.id}
              cx="80"
              cy="80"
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth="14"
              strokeDasharray={`${s.len} ${C - s.len}`}
              strokeDashoffset={-offsets[i]}
              style={{ transition: "stroke-dasharray 300ms ease-out, stroke-dashoffset 300ms ease-out" }}
            />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span data-testid="day-total" className="tabular text-[28px] font-semibold">
          {formatMinutes(total)}
        </span>
        <span className="text-xs text-ink-2">of 16h day</span>
      </div>
    </div>
  );
}
