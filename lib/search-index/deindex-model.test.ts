import { describe, expect, it } from "vitest";
import { deindexRows, indexingPagePath } from "./deindex-model";

const since = new Date("2026-08-12T00:00:00.000Z");

describe("dropped out of the index", () => {
  it("keeps indexed-to-not-indexed changes from the last 90 days, newest first", () => {
    const rows = deindexRows({
      since,
      changes: [
        {
          at: new Date("2026-11-04T00:00:00.000Z"),
          next: { coverageState: "Crawled - currently not indexed", verdict: "FAIL" },
          previous: { verdict: "PASS" },
          url: "https://example.com/older",
        },
        {
          at: new Date("2026-11-06T00:00:00.000Z"),
          next: { coverageState: "Soft 404", verdict: "NEUTRAL" },
          previous: { verdict: "PASS" },
          url: "https://example.com/newer",
        },
        {
          at: new Date("2026-05-01T00:00:00.000Z"),
          next: { coverageState: "Soft 404", verdict: "FAIL" },
          previous: { verdict: "PASS" },
          url: "https://example.com/stale",
        },
        {
          at: new Date("2026-11-02T00:00:00.000Z"),
          next: { verdict: "PASS" },
          previous: { verdict: "FAIL" },
          url: "https://example.com/indexed",
        },
      ],
      signals: [
        {
          at: new Date("2026-11-06T01:00:00.000Z"),
          id: "sig_newer",
          payload: {},
          url: "https://example.com/newer",
        },
        {
          at: new Date("2026-11-01T00:00:00.000Z"),
          id: "sig_signal_only",
          payload: { coverageState: "Not found (404)" },
          url: "https://example.com/signal",
        },
      ],
    });
    expect(rows.map((row) => row.url)).toEqual([
      "https://example.com/newer",
      "https://example.com/older",
      "https://example.com/signal",
    ]);
    expect(rows[0]).toMatchObject({
      annotationId: "sig_newer",
      reason: "Soft 404",
    });
    expect(rows[1]).toMatchObject({
      annotationId: null,
      reason: "Crawled - currently not indexed",
    });
    expect(rows[2]).toMatchObject({ annotationId: "sig_signal_only", reason: "Not found (404)" });
    expect(indexingPagePath("https://example.com/docs/indexing")).toBe("/docs/indexing");
  });
});
