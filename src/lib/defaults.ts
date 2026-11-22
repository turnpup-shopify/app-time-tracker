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
