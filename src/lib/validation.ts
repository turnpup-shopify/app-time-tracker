import { z } from "zod";

export const MIN_ENTRY_MS = 60_000;
export const MAX_ENTRY_MS = 24 * 60 * 60_000;
export const MAX_FUTURE_MS = 24 * 60 * 60_000;

const isoDate = z.iso.datetime({ offset: true }).transform((s) => new Date(s));

export const entryCreateSchema = z.object({
  bucketId: z.uuid(),
  startAt: isoDate,
  endAt: isoDate,
  note: z.string().trim().max(500).optional(),
  clientId: z.uuid().optional(),
});
export type EntryCreateInput = z.infer<typeof entryCreateSchema>;

export const entryPatchSchema = z
  .object({
    bucketId: z.uuid(),
    startAt: isoDate,
    endAt: isoDate,
    note: z.string().trim().max(500).nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");
export type EntryPatchInput = z.infer<typeof entryPatchSchema>;

export const rangeSchema = z
  .object({ from: isoDate, to: isoDate })
  .refine((v) => v.to > v.from, "to must be after from")
  .refine((v) => v.to.getTime() - v.from.getTime() <= 400 * 86_400_000, "Range is too long");

const bucketName = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(24, "Name must be 24 characters or fewer");
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must look like #4F7CFF");

export const bucketCreateSchema = z.object({
  name: bucketName,
  color: hexColor,
  group: z.enum(["work", "life"]),
});

export const bucketPatchSchema = z
  .object({
    name: bucketName,
    color: hexColor,
    group: z.enum(["work", "life"]),
    sort: z.number().int().min(0).max(10_000),
    archived: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

/** Returns an error message, or null when the times are acceptable. */
export function checkEntryTimes(startAt: Date, endAt: Date, now: Date): string | null {
  const ms = endAt.getTime() - startAt.getTime();
  if (ms < MIN_ENTRY_MS) return "An entry must be at least 1 minute long";
  if (ms > MAX_ENTRY_MS) return "An entry can be at most 24 hours long";
  if (startAt.getTime() > now.getTime() + MAX_FUTURE_MS)
    return "Start time can't be more than 1 day in the future";
  return null;
}

/** First readable message from a Zod error. */
export function zodMessage(err: z.ZodError): string {
  const issue = err.issues[0];
  if (!issue) return "Invalid input";
  const path = issue.path.join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}
