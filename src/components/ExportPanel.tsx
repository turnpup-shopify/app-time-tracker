"use client";

import { useEffect, useState } from "react";
import { userTz } from "@/lib/client";
import { addDays, todayStr } from "@/lib/dates";

/** CSV of entries for any range, and a full JSON backup. */
export function ExportPanel() {
  const [today, setToday] = useState<string | null>(null);
  const [tz, setTz] = useState("UTC");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    const t = todayStr();
    // Dates and zone are only known in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToday(t);
    setTz(userTz());
    setFrom(addDays(t, -29));
    setTo(t);
  }, []);

  if (!today) return <div aria-busy className="skeleton mt-3 h-40" />;
  const csvHref = `/api/export/csv?from=${from}&to=${to}&tz=${encodeURIComponent(tz)}`;

  return (
    <div className="glass mt-3 p-5">
      <p className="text-sm text-ink-2">CSV has one row per entry. Times are in {tz}.</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="text-sm text-ink-2">
          From
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => e.target.value && setFrom(e.target.value)}
            className="mt-1 min-h-12 w-full rounded-xl border border-glass-border bg-fill px-2 text-ink"
          />
        </label>
        <label className="text-sm text-ink-2">
          To
          <input
            type="date"
            value={to}
            min={from}
            max={today}
            onChange={(e) => e.target.value && setTo(e.target.value)}
            className="mt-1 min-h-12 w-full rounded-xl border border-glass-border bg-fill px-2 text-ink"
          />
        </label>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <a
          href={csvHref}
          download
          data-testid="download-csv"
          className="press flex min-h-12 items-center justify-center rounded-xl bg-accent font-semibold text-on-accent"
        >
          Download CSV
        </a>
        <a
          href="/api/export/json"
          download
          className="press flex min-h-12 items-center justify-center rounded-xl bg-fill-2 font-medium"
        >
          JSON backup
        </a>
      </div>
    </div>
  );
}
