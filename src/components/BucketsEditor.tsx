"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type ClientBucket } from "@/lib/client";

export function BucketsEditor() {
  const [buckets, setBuckets] = useState<ClientBucket[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setBuckets(await api.buckets());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    // Initial data load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setNotice(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setNotice((e as Error).message);
    }
  }

  async function move(index: number, dir: -1 | 1) {
    if (!buckets) return;
    const next = [...buckets];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setBuckets(next);
    await run(() =>
      Promise.all(
        next.map((b, i) => (b.sort === i ? null : api.updateBucket(b.id, { sort: i }))),
      ),
    );
  }

  if (error) {
    return (
      <div className="glass mt-3 p-5">
        <p>We couldn&apos;t load your buckets. {error}</p>
        <button type="button" onClick={() => void load()} className="mt-3 min-h-12 rounded-xl bg-fill-2 px-5">
          Retry
        </button>
      </div>
    );
  }
  if (!buckets) return <div aria-busy className="skeleton mt-3 h-64" />;

  return (
    <div className="mt-3">
      {notice && (
        <p role="alert" className="glass mb-3 p-4 text-danger" data-testid="bucket-notice">
          {notice}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {buckets.map((b, i) => (
          <li
            key={b.id}
            data-testid={`edit-bucket-${b.name}`}
            className={`glass p-3 ${b.archivedAt ? "opacity-60" : ""}`}
          >
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label={`Color for ${b.name}`}
                defaultValue={b.color}
                onBlur={(e) => {
                  const color = e.target.value.toUpperCase();
                  if (color !== b.color.toUpperCase()) void run(() => api.updateBucket(b.id, { color }));
                }}
                className="h-12 w-12 shrink-0 cursor-pointer rounded-xl border border-glass-border bg-transparent"
              />
              <input
                aria-label={`Name for ${b.name}`}
                defaultValue={b.name}
                maxLength={24}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name && name !== b.name) void run(() => api.updateBucket(b.id, { name }));
                  else e.target.value = b.name;
                }}
                className="min-h-12 min-w-0 flex-1 rounded-xl border border-glass-border bg-fill px-3 text-ink"
              />
              <button
                type="button"
                aria-label={`Move ${b.name} up`}
                disabled={i === 0}
                onClick={() => void move(i, -1)}
                className="min-h-12 min-w-12 rounded-xl bg-fill disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move ${b.name} down`}
                disabled={i === buckets.length - 1}
                onClick={() => void move(i, 1)}
                className="min-h-12 min-w-12 rounded-xl bg-fill disabled:opacity-30"
              >
                ↓
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-sm">
              <button
                type="button"
                onClick={() =>
                  void run(() => api.updateBucket(b.id, { group: b.group === "work" ? "life" : "work" }))
                }
                className="min-h-12 rounded-xl bg-fill px-4 text-ink"
              >
                Group: {b.group === "work" ? "Work" : "Life"}
              </button>
              <button
                type="button"
                onClick={() => void run(() => api.updateBucket(b.id, { archived: !b.archivedAt }))}
                className="min-h-12 rounded-xl bg-fill px-4 text-ink"
              >
                {b.archivedAt ? "Unarchive" : "Archive"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Delete "${b.name}"?`)) void run(() => api.deleteBucket(b.id));
                }}
                className="min-h-12 rounded-xl px-4 text-danger"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
      <AddBucket onAdd={(b) => run(() => api.createBucket(b))} />
    </div>
  );
}

function AddBucket({
  onAdd,
}: {
  onAdd: (b: { name: string; color: string; group: "work" | "life" }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#2BB3C0");
  const [group, setGroup] = useState<"work" | "life">("life");

  return (
    <form
      className="glass mt-3 flex flex-wrap items-center gap-2 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        await onAdd({ name: name.trim(), color: color.toUpperCase(), group });
        setName("");
      }}
    >
      <input
        type="color"
        aria-label="New bucket color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        className="h-12 w-12 rounded-xl border border-glass-border bg-transparent"
      />
      <input
        aria-label="New bucket name"
        placeholder="New bucket"
        value={name}
        maxLength={24}
        onChange={(e) => setName(e.target.value)}
        className="min-h-12 min-w-0 flex-1 rounded-xl border border-glass-border bg-fill px-3 text-ink placeholder:text-ink-2"
      />
      <button
        type="button"
        onClick={() => setGroup(group === "work" ? "life" : "work")}
        className="min-h-12 rounded-xl bg-fill px-3 text-sm"
      >
        {group === "work" ? "Work" : "Life"}
      </button>
      <button type="submit" className="min-h-12 rounded-xl bg-accent px-4 font-semibold text-on-accent">
        Add
      </button>
    </form>
  );
}
