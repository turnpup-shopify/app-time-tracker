/** Start and end of a quick log block that ends at `endAt`. */
export function quickLogRange(minutes: number, endAt: Date): { startAt: Date; endAt: Date } {
  const end = new Date(endAt);
  end.setSeconds(0, 0);
  return { startAt: new Date(end.getTime() - minutes * 60_000), endAt: end };
}

/** Local midnight to next local midnight for the day containing `d`. */
export function localDayRange(d: Date): { from: Date; to: Date } {
  const from = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const to = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return { from, to };
}

/** Minutes of an entry that fall inside [from, to). Running entries count up to `now`. */
export function minutesWithin(
  e: { startAt: Date; endAt: Date | null },
  from: Date,
  to: Date,
  now = new Date(),
): number {
  const s = Math.max(e.startAt.getTime(), from.getTime());
  const end = (e.endAt ?? now).getTime();
  const f = Math.min(end, to.getTime());
  return f > s ? Math.round((f - s) / 60_000) : 0;
}

export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Clock time reached by counting `minutes` forward from `startHour`. 750 from 8 is "8:30 PM". */
export function upToLabel(minutes: number, startHour: number): string {
  const total = startHour * 60 + Math.max(0, Math.round(minutes));
  const h24 = Math.floor(total / 60) % 24;
  const m = total % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}
