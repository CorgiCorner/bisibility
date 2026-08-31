import { describe, expect, it } from "vitest";
import { summarizeImportObservability } from "./import-observability";

const dims = ["query", "page", "query,page"];
function day(date: string, fetchedAt = `${date}T12:00:00.000Z`) {
  return dims.map((dimensions) => ({ date, dimensions, fetchedAt }));
}
const aggregate = {
  dataState: "final",
  dimensions: "date",
  endDate: "2026-07-28",
  operation: "aggregate",
  persistedAt: "2026-07-28T12:00:00.000Z",
  searchType: "web",
  source: "gsc",
  startDate: "2026-07-01",
};

describe("summarizeImportObservability", () => {
  it("requires all three durable dimensional keys on 28 newest consecutive finalized days", () => {
    const rows = Array.from({ length: 28 }, (_, index) =>
      day(`2026-07-${String(28 - index).padStart(2, "0")}`),
    ).flat();
    expect(
      summarizeImportObservability({
        aggregateRanges: [aggregate],
        boundary: "2026-07-28",
        daysTotal: 93,
        now: new Date("2026-07-28T12:05:00Z"),
        rows,
      }),
    ).toMatchObject({
      completedDays: 28,
      firstViewReady: true,
      localReadableThrough: "2026-07-28",
    });
    expect(
      summarizeImportObservability({
        aggregateRanges: [aggregate],
        boundary: "2026-07-28",
        daysTotal: 93,
        now: new Date("2026-07-28T12:05:00Z"),
        rows: rows.slice(0, -1),
      }).firstViewReady,
    ).toBe(false);
  });

  it("rejects 27 days, older windows, gaps, duplicate keys, and aggregate provenance", () => {
    const newest27 = Array.from({ length: 27 }, (_, index) =>
      day(`2026-07-${String(28 - index).padStart(2, "0")}`),
    ).flat();
    expect(
      summarizeImportObservability({
        aggregateRanges: [aggregate],
        boundary: "2026-07-28",
        daysTotal: 93,
        now: new Date(),
        rows: newest27,
      }).firstViewReady,
    ).toBe(false);
    const older28 = Array.from({ length: 28 }, (_, index) =>
      day(`2026-06-${String(28 - index).padStart(2, "0")}`),
    ).flat();
    expect(
      summarizeImportObservability({
        aggregateRanges: [aggregate],
        boundary: "2026-07-28",
        daysTotal: 93,
        now: new Date(),
        rows: older28,
      }).firstViewReady,
    ).toBe(false);
    expect(
      summarizeImportObservability({
        aggregateRanges: [aggregate],
        boundary: "2026-07-28",
        daysTotal: 93,
        now: new Date(),
        rows: [
          ...newest27,
          { date: "2026-07-01", dimensions: "date", fetchedAt: "2026-07-01T12:00:00Z" },
        ],
      }).completedDays,
    ).toBe(27);
  });

  it("requires successful aggregate range persistence over the same 28-day window", () => {
    const rows = Array.from({ length: 28 }, (_, index) =>
      day(`2026-07-${String(28 - index).padStart(2, "0")}`),
    ).flat();
    const base = { boundary: "2026-07-28", daysTotal: 93, now: new Date(), rows };
    expect(summarizeImportObservability({ ...base, aggregateRanges: [] }).firstViewReady).toBe(
      false,
    );
    expect(
      summarizeImportObservability({
        ...base,
        aggregateRanges: [{ ...aggregate, startDate: "2026-07-02" }],
      }).firstViewReady,
    ).toBe(false);
    expect(
      summarizeImportObservability({ ...base, aggregateRanges: [aggregate] }).firstViewReady,
    ).toBe(true);
    expect(
      summarizeImportObservability({
        ...base,
        aggregateRanges: [{ ...aggregate, persistedAt: null }],
      }).firstViewReady,
    ).toBe(false);
  });

  it("counts zero-row dimensional days from provenance when aggregate coverage is durable", () => {
    const rows = Array.from({ length: 28 }, (_, index) =>
      day(`2026-07-${String(28 - index).padStart(2, "0")}`),
    ).flat();
    expect(
      summarizeImportObservability({
        aggregateRanges: [aggregate],
        boundary: "2026-07-28",
        daysTotal: 93,
        now: new Date(),
        rows,
      }),
    ).toMatchObject({ completedDays: 28, firstViewReady: true });
  });

  it("uses durable activity, waits only strictly after ten minutes, and labels every ETA about", () => {
    const rows = Array.from({ length: 8 }, (_, index) =>
      day(
        `2026-07-${String(28 - index).padStart(2, "0")}`,
        `2026-07-28T${String(11 - index).padStart(2, "0")}:00:00Z`,
      ),
    ).flat();
    const exact = summarizeImportObservability({
      aggregateRanges: [aggregate],
      boundary: "2026-07-28",
      daysTotal: 93,
      now: new Date("2026-07-28T11:10:00Z"),
      rows,
    });
    expect(exact.waiting).toBe(false);
    const stale = summarizeImportObservability({
      aggregateRanges: [aggregate],
      boundary: "2026-07-28",
      daysTotal: 93,
      now: new Date("2026-07-28T11:10:00.001Z"),
      rows,
    });
    expect(stale.waiting).toBe(true);
    expect(stale.etaLabel === null || stale.etaLabel.includes("about")).toBe(true);
  });
});
