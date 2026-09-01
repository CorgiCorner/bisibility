import { addDays } from "@/lib/search-insights/dates";
import { describe, expect, it } from "vitest";
import { selectImportObservabilityFacts } from "./import-observability";

const dimensions = ["query", "page", "query,page"];
const boundary = "2026-07-29";

function day(date: string, fetchedAt = `${date}T12:00:00.000Z`) {
  return dimensions.map((dimension) => ({ date, dimensions: dimension, fetchedAt }));
}

function consecutive(length: number) {
  return Array.from({ length }, (_, index) => day(addDays(boundary, -index)));
}

function aggregate(start = addDays(boundary, -179), end = boundary) {
  return {
    dataState: "final",
    dimensions: "date",
    endDate: end,
    operation: "aggregate",
    persistedAt: `${boundary}T12:00:00.000Z`,
    searchType: "web",
    source: "gsc",
    startDate: start,
  };
}

function facts(rows: ReturnType<typeof day>[], overrides: Record<string, unknown> = {}) {
  return selectImportObservabilityFacts({
    aggregateRanges: [aggregate()],
    boundary,
    daysTotal: 488,
    now: new Date("2026-07-29T13:00:00.000Z"),
    rows: rows.flat(),
    ...overrides,
  });
}

describe("selectImportObservabilityFacts", () => {
  it("keeps a 28-day gate closed for a gap, even with 29 imported days", () => {
    const rows = Array.from({ length: 30 }, (_, index) => day(addDays(boundary, -index))).filter(
      (_, index) => index !== 10,
    );
    const gapped = facts(rows);

    expect(gapped.qualifyingDays).toBe(27);
    expect(gapped.consecutiveDays).toBe(10);
    expect(gapped.readyThrough.d28.current).toBe(false);

    const complete = facts(
      Array.from({ length: 28 }, (_, index) => day(addDays(boundary, -index))),
    );
    expect(complete.qualifyingDays).toBe(28);
    expect(complete.consecutiveDays).toBe(28);
    expect(complete.readyThrough.d28.current).toBe(true);
  });

  it.each([
    [10, { current: true, previous: false }],
    [14, { current: true, previous: true }],
  ])("covers d7 current and previous from %i consecutive days", (length, d7) => {
    expect(
      facts(Array.from({ length }, (_, index) => day(addDays(boundary, -index)))).readyThrough.d7,
    ).toEqual(d7);
  });

  it.each([
    [28, { current: true, previous: false }],
    [56, { current: true, previous: true }],
  ])("covers d28 current and previous from %i consecutive days", (length, d28) => {
    expect(
      facts(Array.from({ length }, (_, index) => day(addDays(boundary, -index)))).readyThrough.d28,
    ).toEqual(d28);
  });

  it("requires complete partitions and a persisted final aggregate for every preset range", () => {
    const rows = consecutive(90);
    expect(facts(rows, { aggregateRanges: [] }).readyThrough.d90.current).toBe(false);
    expect(
      facts(rows, { aggregateRanges: [{ ...aggregate(), persistedAt: null }] }).readyThrough.d90
        .current,
    ).toBe(false);
    expect(
      facts(rows, { aggregateRanges: [aggregate(addDays(boundary, -88))] }).readyThrough.d90
        .current,
    ).toBe(false);
    expect(facts(rows).readyThrough.d90.current).toBe(true);
    expect(
      facts(rows.map((entry, index) => (index === 0 ? entry.slice(1) : entry))).readyThrough.d90
        .current,
    ).toBe(false);
  });

  it("uses the newer durable activity and produces integer stall and deep-history facts", () => {
    const selected = facts(consecutive(90), {
      daysTotal: 93,
      lastProbeAt: "2026-07-29T10:00:00.000Z",
      latestRequestAttemptAt: "2026-07-29T12:45:00.000Z",
      plannedRetentionMonths: 16,
      requestSetsPerHour: 42,
    });

    expect(selected).toMatchObject({
      consecutiveDays: 90,
      deepHistoryMonths: { completed: 3, target: 16 },
      lastActivityAt: "2026-07-29T12:45:00.000Z",
      lastProbeAt: "2026-07-29T10:00:00.000Z",
      stall: {
        expectedBatchMs: 1_800_000,
        expectedDayMs: 257_143,
        nextRequestInMs: 900_000,
        silenceMs: 900_000,
        thresholdMs: 2_700_000,
      },
      targetDays: 28,
    });
  });

  it("returns only JSON-safe values", () => {
    const selected = facts(consecutive(14));
    expect(JSON.parse(JSON.stringify(selected))).toEqual(selected);
    expect(Object.keys(selected).sort()).toEqual([
      "consecutiveDays",
      "deepHistoryMonths",
      "lastActivityAt",
      "lastProbeAt",
      "qualifyingDays",
      "readyThrough",
      "stall",
      "targetDays",
    ]);
  });
});
