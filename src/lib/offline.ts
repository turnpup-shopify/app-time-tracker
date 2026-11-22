"use client";

/**
 * Entries saved while offline. Each keeps the client id it was created with,
 * so sending it twice after reconnecting still makes one entry on the server.
 */
export type QueuedEntry = {
  clientId: string;
  bucketId: string;
  startAt: string;
  endAt: string;
  note?: string;
  queuedAt: string;
};

const KEY = "tt.offline-queue.v1";

export function readQueue(): QueuedEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(q: QueuedEntry[]) {
  try {
    if (q.length) localStorage.setItem(KEY, JSON.stringify(q));
    else localStorage.removeItem(KEY);
  } catch {
    /* Storage blocked. The entry still shows until the page closes. */
  }
}

export function enqueue(item: QueuedEntry) {
  const q = readQueue().filter((x) => x.clientId !== item.clientId);
  writeQueue([...q, item]);
}

export function dequeue(clientId: string) {
  writeQueue(readQueue().filter((x) => x.clientId !== clientId));
}
