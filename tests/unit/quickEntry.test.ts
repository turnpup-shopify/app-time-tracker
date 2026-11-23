import { describe, expect, it } from "vitest";
import { parseDuration, parseQuery, searchBuckets } from "@/lib/quickEntry";

describe("parseDuration", () => {
  it.each([
    ["45", 45],
    ["45m", 45],
    ["45 min", 45],
    ["1h", 60],
    ["1.5h", 90],
    ["1h30", 90],
    ["1h 30m", 90],
    ["1 h 30 m", 90],
    ["1:15", 75],
    ["2 hours", 120],
  ])("%s is %i minutes", (input, minutes) => {
    expect(parseDuration(input)).toBe(minutes);
  });

  it.each(["", "abc", "0", "25h", "1:75"])("%s is not a valid duration", (input) => {
    expect(parseDuration(input)).toBeNull();
  });
});

describe("parseQuery", () => {
  it("splits search words from an optional duration", () => {
    expect(parseQuery("health 45m")).toEqual({ term: "health", minutes: 45 });
    expect(parseQuery("45 hea")).toEqual({ term: "hea", minutes: 45 });
    expect(parseQuery("work fd 1h 30m")).toEqual({ term: "work fd", minutes: 90 });
    expect(parseQuery("hobbies")).toEqual({ term: "hobbies", minutes: null });
    expect(parseQuery("2h")).toEqual({ term: "", minutes: 120 });
    expect(parseQuery("  ")).toEqual({ term: "", minutes: null });
  });
});

describe("searchBuckets", () => {
  const buckets = ["Work FD", "Work Personal", "Health", "Non-computer", "Hobbies Computer"].map((name) => ({ name }));
  const names = (term: string) => searchBuckets(buckets, term).map((b) => b.name);

  it("prefix beats initials beats contains beats letters in order", () => {
    expect(names("h")).toEqual(["Health", "Hobbies Computer"]);
    expect(names("wfd")).toEqual(["Work FD"]);
    expect(names("comp")).toEqual(["Non-computer", "Hobbies Computer"]);
    expect(names("hbc")).toEqual(["Hobbies Computer"]);
    expect(names("")).toHaveLength(5);
    expect(names("zzz")).toEqual([]);
  });
});
