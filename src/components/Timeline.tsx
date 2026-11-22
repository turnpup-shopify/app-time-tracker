"use client";

import { useRef, useState } from "react";
import { formatMinutes } from "@/lib/time";
import { fmtTime, type ClientBucket, type ClientEntry } from "@/lib/client";

const SWIPE_DELETE_PX = 90;

export function Timeline({
  entries,
  buckets,
  onDelete,
  onEdit,
}: {
  entries: ClientEntry[];
  buckets: Map<string, ClientBucket>;
  onDelete: (e: ClientEntry) => void;
  onEdit: (e: ClientEntry) => void;
}) {
  if (entries.length === 0) {
    return <p className="glass p-5 text-ink-2">Nothing logged yet today.</p>;
  }
  return (
    <ul className="flex flex-col gap-2" data-testid="timeline">
      {entries.map((e) => (
        <Row key={e.id} entry={e} bucket={buckets.get(e.bucketId)} onDelete={onDelete} onEdit={onEdit} />
      ))}
    </ul>
  );
}

function Row({
  entry,
  bucket,
  onDelete,
  onEdit,
}: {
  entry: ClientEntry;
  bucket?: ClientBucket;
  onDelete: (e: ClientEntry) => void;
  onEdit: (e: ClientEntry) => void;
}) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiping = useRef(false);

  const minutes = entry.endAt
    ? Math.round((entry.endAt.getTime() - entry.startAt.getTime()) / 60_000)
    : 0;

  return (
    <li className="fade-in relative overflow-hidden rounded-[20px]">
      <div aria-hidden className="absolute inset-0 flex items-center justify-end bg-danger-bg pr-5 font-medium text-white">
        Delete
      </div>
      <button
        type="button"
        data-testid="timeline-row"
        aria-label={`${bucket?.name ?? "Entry"} ${fmtTime(entry.startAt)} to ${
          entry.endAt ? fmtTime(entry.endAt) : "now"
        }. Tap to edit`}
        onPointerDown={(ev) => {
          start.current = { x: ev.clientX, y: ev.clientY };
          swiping.current = false;
        }}
        onPointerMove={(ev) => {
          if (!start.current) return;
          const x = ev.clientX - start.current.x;
          const y = ev.clientY - start.current.y;
          if (!swiping.current && Math.abs(x) > 10 && Math.abs(x) > Math.abs(y)) swiping.current = true;
          if (swiping.current) setDx(Math.min(0, x));
        }}
        onPointerUp={() => {
          if (swiping.current && dx < -SWIPE_DELETE_PX) onDelete(entry);
          setDx(0);
          start.current = null;
        }}
        onPointerCancel={() => {
          setDx(0);
          start.current = null;
        }}
        onClick={() => {
          if (swiping.current) {
            swiping.current = false;
            return;
          }
          onEdit(entry);
        }}
        style={{ transform: `translateX(${dx}px)`, touchAction: "pan-y" }}
        className={`glass relative flex min-h-16 w-full items-center gap-3 rounded-[20px]! bg-surface! p-4 text-left ${
          dx === 0 ? "transition-transform" : ""
        } ${entry.pending ? "opacity-70" : ""}`}
      >
        <span aria-hidden className="h-10 w-1.5 rounded-full" style={{ background: bucket?.color ?? "#888" }} />
        <span className="flex-1">
          <span className="block font-medium">{bucket?.name ?? "Unknown bucket"}</span>
          <span className="tabular block text-sm text-ink-2">
            {fmtTime(entry.startAt)} to {entry.endAt ? fmtTime(entry.endAt) : "now"}
            {entry.note ? ` · ${entry.note}` : ""}
          </span>
        </span>
        <span className="tabular text-ink-2">{minutes ? formatMinutes(minutes) : ""}</span>
      </button>
    </li>
  );
}
