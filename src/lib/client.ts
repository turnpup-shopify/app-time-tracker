"use client";

export type ClientBucket = {
  id: string;
  name: string;
  color: string;
  group: "work" | "life";
  sort: number;
  archivedAt: string | null;
};

export type ClientEntry = {
  id: string;
  bucketId: string;
  startAt: Date;
  endAt: Date | null;
  source: "manual" | "timer" | "calendar";
  note: string | null;
  pending?: boolean;
};

type RawEntry = Omit<ClientEntry, "startAt" | "endAt"> & { startAt: string; endAt: string | null };

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError(0, "You look offline. Check your connection and try again.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? "Something went wrong. Try again.");
  return body as T;
}

const parseEntry = (e: RawEntry): ClientEntry => ({
  ...e,
  startAt: new Date(e.startAt),
  endAt: e.endAt ? new Date(e.endAt) : null,
});

export const api = {
  buckets: () => call<{ buckets: ClientBucket[] }>("/api/buckets").then((r) => r.buckets),
  createBucket: (b: { name: string; color: string; group: "work" | "life" }) =>
    call<{ bucket: ClientBucket }>("/api/buckets", { method: "POST", body: JSON.stringify(b) }).then(
      (r) => r.bucket,
    ),
  updateBucket: (id: string, patch: Record<string, unknown>) =>
    call<{ bucket: ClientBucket }>(`/api/buckets/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }).then((r) => r.bucket),
  deleteBucket: (id: string) => call(`/api/buckets/${id}`, { method: "DELETE" }),

  entries: (from: Date, to: Date) =>
    call<{ entries: RawEntry[] }>(
      `/api/entries?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
    ).then((r) => r.entries.map(parseEntry)),
  createEntry: (e: {
    bucketId: string;
    startAt: Date;
    endAt: Date;
    note?: string;
    clientId: string;
  }) =>
    call<{ entry: RawEntry }>("/api/entries", {
      method: "POST",
      body: JSON.stringify({
        ...e,
        startAt: e.startAt.toISOString(),
        endAt: e.endAt.toISOString(),
        note: e.note || undefined,
      }),
    }).then((r) => parseEntry(r.entry)),
  updateEntry: (
    id: string,
    patch: { bucketId?: string; startAt?: Date; endAt?: Date; note?: string | null },
  ) =>
    call<{ entry: RawEntry }>(`/api/entries/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        ...patch,
        startAt: patch.startAt?.toISOString(),
        endAt: patch.endAt?.toISOString(),
      }),
    }).then((r) => parseEntry(r.entry)),
  deleteEntry: (id: string) => call(`/api/entries/${id}`, { method: "DELETE" }),
  restoreEntry: (id: string) =>
    call<{ entry: RawEntry }>(`/api/entries/${id}/restore`, { method: "POST" }).then((r) =>
      parseEntry(r.entry),
    ),
};

export function newClientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Fallback for old browsers. RFC 4122 v4 shape.
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (+c ^ (Math.random() * 16) >> (+c / 4)).toString(16),
  );
}

export function haptic() {
  try {
    navigator.vibrate?.(10);
  } catch {
    /* not supported */
  }
}

export const fmtTime = (d: Date) =>
  d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** "HH:MM" for an <input type="time">. */
export const toTimeInput = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** Date on the same day as `base` at "HH:MM". */
export function atTime(base: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m);
}
