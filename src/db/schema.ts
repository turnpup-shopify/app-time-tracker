import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  googleSub: text("google_sub").notNull().unique(),
  email: text("email"),
  name: text("name"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const buckets = pgTable(
  "buckets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
    group: text("group", { enum: ["work", "life"] }).notNull(),
    sort: integer("sort").notNull().default(0),
    archivedAt: ts("archived_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("buckets_user_name_uq").on(t.userId, sql`lower(${t.name})`),
    check("buckets_name_len", sql`char_length(${t.name}) between 1 and 24`),
  ],
);

export const calendarAccounts = pgTable(
  "calendar_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slot: text("slot", { enum: ["work", "personal"] }).notNull(),
    email: text("email"),
    refreshTokenEnc: text("refresh_token_enc"),
    icsUrlEnc: text("ics_url_enc"),
    syncToken: text("sync_token"),
    defaultBucketId: uuid("default_bucket_id").references(() => buckets.id, {
      onDelete: "set null",
    }),
    status: text("status", { enum: ["connected", "reconnect_needed", "disconnected"] })
      .notNull()
      .default("disconnected"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("calendar_accounts_user_slot_uq").on(t.userId, t.slot)],
);

export const entries = pgTable(
  "entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bucketId: uuid("bucket_id")
      .notNull()
      .references(() => buckets.id, { onDelete: "restrict" }),
    startAt: ts("start_at").notNull(),
    endAt: ts("end_at"),
    source: text("source", { enum: ["manual", "timer", "calendar"] }).notNull(),
    note: text("note"),
    accountId: uuid("account_id").references(() => calendarAccounts.id, {
      onDelete: "cascade",
    }),
    externalId: text("external_id"),
    bucketLocked: boolean("bucket_locked").notNull().default(false),
    clientId: uuid("client_id"),
    deletedAt: ts("deleted_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("entries_end_after_start", sql`${t.endAt} is null or ${t.endAt} > ${t.startAt}`),
    index("entries_user_start_idx").on(t.userId, t.startAt),
    uniqueIndex("entries_account_external_uq").on(t.accountId, t.externalId),
    uniqueIndex("entries_user_client_uq").on(t.userId, t.clientId),
    // Only one running timer per user.
    uniqueIndex("entries_one_running_timer_uq")
      .on(t.userId)
      .where(sql`${t.endAt} is null and ${t.deletedAt} is null`),
  ],
);

export const rules = pgTable("rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  keyword: text("keyword").notNull(),
  bucketId: uuid("bucket_id")
    .notNull()
    .references(() => buckets.id, { onDelete: "cascade" }),
  sort: integer("sort").notNull().default(0),
});

export type User = typeof users.$inferSelect;
export type Bucket = typeof buckets.$inferSelect;
export type Entry = typeof entries.$inferSelect;
