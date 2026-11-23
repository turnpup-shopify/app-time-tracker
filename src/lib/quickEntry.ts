/**
 * Parses the Today search box. Text is a bucket search. A duration anywhere in it is optional.
 * "health 45m", "45 hea", "1h30 work fd", "1:15", "90".
 */

const UNIT_RE = /^(\d+(?:\.\d+)?)(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)$/;
const COMBO_RE = /^(\d+)h(\d+)m?$/; // 1h30, 1h30m
const CLOCK_RE = /^(\d+):([0-5]\d)$/; // 1:30
const BARE_RE = /^\d+$/; // 90 means minutes

export const MAX_MINUTES = 24 * 60;

function tokenMinutes(t: string): number | null {
  let m: RegExpMatchArray | null;
  if ((m = t.match(COMBO_RE))) return Number(m[1]) * 60 + Number(m[2]);
  if ((m = t.match(CLOCK_RE))) return Number(m[1]) * 60 + Number(m[2]);
  if ((m = t.match(UNIT_RE))) return Math.round(Number(m[1]) * (m[2].startsWith("h") ? 60 : 1));
  if (BARE_RE.test(t)) return Number(t);
  return null;
}

/** Minutes from a duration string, or null when it isn't one or is out of range. */
export function parseDuration(input: string): number | null {
  const tokens = normalize(input).split(" ").filter(Boolean);
  if (!tokens.length) return null;
  let total = 0;
  for (const t of tokens) {
    const v = tokenMinutes(t);
    if (v === null) return null;
    total += v;
  }
  return total >= 1 && total <= MAX_MINUTES ? total : null;
}

/** Joins "1 h 30 m" into "1h 30m" so units stick to their numbers. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/(\d)\s+(h|hr|hrs|hours?|m|mins?|minutes?)\b/g, "$1$2")
    .replace(/\s+/g, " ");
}

export type Query = { term: string; minutes: number | null };

export function parseQuery(input: string): Query {
  const tokens = normalize(input).split(" ").filter(Boolean);
  let minutes = 0;
  let found = false;
  const words: string[] = [];
  for (const t of tokens) {
    const v = tokenMinutes(t);
    if (v !== null) {
      minutes += v;
      found = true;
    } else words.push(t);
  }
  const valid = found && minutes >= 1 && minutes <= MAX_MINUTES;
  return { term: words.join(" "), minutes: valid ? minutes : null };
}

/** Scores a bucket name for a search term. Higher is better. 0 means no match. */
export function matchScore(name: string, term: string): number {
  if (!term) return 1;
  const n = name.toLowerCase();
  const t = term.toLowerCase();
  if (n.startsWith(t)) return 4;
  const initials = n
    .split(/[\s-]+/)
    .map((w) => w[0])
    .join("");
  if (initials.startsWith(t.replace(/\s/g, ""))) return 3;
  if (n.includes(t)) return 2;
  // Letters in order, like "hbc" for Hobbies Computer.
  let i = 0;
  for (const ch of n) if (ch === t[i]) i++;
  return i === t.length ? 1 : 0;
}

export function searchBuckets<T extends { name: string }>(buckets: T[], term: string): T[] {
  return buckets
    .map((b, i) => ({ b, i, s: matchScore(b.name, term) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.b);
}
