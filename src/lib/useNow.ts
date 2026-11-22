"use client";

import { useEffect, useState } from "react";

/** Current time in ms, refreshed every `ms`. Returns 0 until mounted. */
export function useNow(ms = 1000, enabled = true): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const tick = () => setNow(Date.now());
    const first = requestAnimationFrame(tick);
    const id = setInterval(tick, ms);
    return () => {
      cancelAnimationFrame(first);
      clearInterval(id);
    };
  }, [ms, enabled]);
  return now;
}
