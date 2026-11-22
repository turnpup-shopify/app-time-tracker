/** Calendar dates as "YYYY-MM-DD" strings. Pure helpers, safe on server and client. */

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Today's date on this device. */
export function todayStr(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Monday of the week holding `date`. */
export function weekStart(date: string): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 is Sunday
  return addDays(date, -((dow + 6) % 7));
}

export function monthRange(date: string): { from: string; to: string } {
  const [y, m] = date.split("-").map(Number);
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from, to: `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}` };
}

export function shiftMonth(date: string, n: number): string {
  const [y, m] = date.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

const fmt = (date: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });

export const dayLabel = (date: string) => fmt(date, { weekday: "short", month: "short", day: "numeric" });
export const shortLabel = (date: string) => fmt(date, { month: "short", day: "numeric" });
export const weekdayInitial = (date: string) => fmt(date, { weekday: "narrow" });
export const monthLabel = (date: string) => fmt(date, { month: "long", year: "numeric" });
