"use client";

import { useState } from "react";
import { atTime, toTimeInput, type ClientBucket, type ClientEntry } from "@/lib/client";

export function EntrySheet({
  entry,
  buckets,
  onClose,
  onSave,
  onDelete,
}: {
  entry: ClientEntry;
  buckets: ClientBucket[];
  onClose: () => void;
  onSave: (patch: { bucketId?: string; startAt?: Date; endAt?: Date; note?: string | null }) => Promise<void>;
  onDelete: () => void;
}) {
  const [bucketId, setBucketId] = useState(entry.bucketId);
  const [start, setStart] = useState(toTimeInput(entry.startAt));
  const [end, setEnd] = useState(entry.endAt ? toTimeInput(entry.endAt) : "");
  const [note, setNote] = useState(entry.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const choices = buckets.filter((b) => !b.archivedAt || b.id === entry.bucketId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const startAt = atTime(entry.startAt, start);
    let endAt = end ? atTime(entry.startAt, end) : undefined;
    // An end earlier than the start means the block ran past midnight.
    if (endAt && endAt <= startAt) endAt = new Date(endAt.getTime() + 86_400_000);
    setBusy(true);
    try {
      await onSave({
        bucketId: bucketId !== entry.bucketId ? bucketId : undefined,
        startAt,
        endAt,
        note: note.trim() || null,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Edit entry"
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="mx-auto w-full max-w-md rounded-t-[24px] border border-glass-border bg-[#141826] p-5 pb-[max(20px,env(safe-area-inset-bottom))]"
      >
        <h2 className="text-lg font-semibold">Edit entry</h2>

        <fieldset className="mt-4">
          <legend className="text-sm text-ink-2">Bucket</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {choices.map((b) => (
              <button
                key={b.id}
                type="button"
                aria-pressed={bucketId === b.id}
                onClick={() => setBucketId(b.id)}
                className={`flex min-h-12 items-center gap-2 rounded-full border px-4 ${
                  bucketId === b.id ? "border-ink bg-white/15" : "border-glass-border bg-white/5"
                }`}
              >
                <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />
                {b.name}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-sm text-ink-2">
            Start
            <input
              type="time"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="mt-1 min-h-12 w-full rounded-xl border border-glass-border bg-white/5 px-3 text-ink [color-scheme:dark]"
            />
          </label>
          <label className="text-sm text-ink-2">
            End
            <input
              type="time"
              required
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="mt-1 min-h-12 w-full rounded-xl border border-glass-border bg-white/5 px-3 text-ink [color-scheme:dark]"
            />
          </label>
        </div>

        <label className="mt-4 block text-sm text-ink-2">
          Note
          <input
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 min-h-12 w-full rounded-xl border border-glass-border bg-white/5 px-3 text-ink"
          />
        </label>

        {error && (
          <p role="alert" className="mt-3 text-danger">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onDelete}
            className="min-h-12 rounded-xl border border-danger/60 px-4 font-medium text-danger"
          >
            Delete
          </button>
          <button type="button" onClick={onClose} className="min-h-12 flex-1 rounded-xl bg-white/5 px-4 text-ink">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="min-h-12 flex-1 rounded-xl bg-[#4F7CFF] px-4 font-semibold text-white disabled:opacity-60"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
