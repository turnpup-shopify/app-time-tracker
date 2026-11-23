export type BucketGroup = "work" | "life";

export const DEFAULT_BUCKETS: { name: string; group: BucketGroup; color: string }[] = [
  { name: "Work FD", group: "work", color: "#4F7CFF" },
  { name: "Work Personal", group: "work", color: "#9B6BFF" },
  { name: "Health", group: "life", color: "#27AE60" },
  { name: "Non-computer", group: "life", color: "#F2994A" },
  { name: "Hobbies Computer", group: "life", color: "#E85D75" },
];

export const QUICK_DURATIONS = [15, 30, 60, 120] as const;

export const UNDO_MS = 6000;

/** Your waking day starts at this hour. Logged time counts forward from here. */
export const DAY_START_HOUR = 8;
/** Length of the waking day the ring fills toward. 8 AM plus 16h is midnight. */
export const DAY_TARGET_MIN = 16 * 60;
