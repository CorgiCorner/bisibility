import { describe, expect, it } from "vitest";
import { reasonCountRows } from "./reason-change";

const cutoff = new Date("2026-11-03T00:00:00.000Z");
const crawled = "Crawled - currently not indexed";
const discovered = "Discovered - currently not indexed";

function row(
  url: string,
  coverageState: string,
  checkedAt = "2026-10-01T00:00:00.000Z",
  extra: {
    inspectionError?: string | null;
    inspectionFailedAt?: string | null;
    verdict?: string;
  } = {},
) {
  return {
    checkedAt: new Date(checkedAt),
    coverageState,
    inspectionError: extra.inspectionError ?? null,
    inspectionFailedAt: extra.inspectionFailedAt ? new Date(extra.inspectionFailedAt) : null,
    url,
    verdict: extra.verdict ?? "FAIL",
  };
}

describe("not-indexed reason changes", () => {
  it("counts an increase, an unchanged reason and a reason that is new", () => {
    const result = reasonCountRows({
      cutoff,
      rows: [
        row("https://example.com/a", crawled),
        row("https://example.com/b", crawled, "2026-11-05T00:00:00.000Z"),
        row("https://example.com/c", discovered),
        row("https://example.com/d", "Soft 404", "2026-11-06T00:00:00.000Z"),
      ],
      changes: [
        {
          at: new Date("2026-11-05T00:00:00.000Z"),
          next: { coverageState: crawled, verdict: "FAIL" },
          previous: { coverageState: "Submitted and indexed", verdict: "PASS" },
          url: "https://example.com/b",
        },
        {
          at: new Date("2026-11-06T00:00:00.000Z"),
          next: { coverageState: "Soft 404", verdict: "FAIL" },
          previous: null,
          url: "https://example.com/d",
        },
      ],
    });
    expect(result.derived).toBe(true);
    expect(result.rows).toEqual([
      { change: { delta: 1, kind: "increased" }, count: 2, coverageState: crawled },
      { change: { delta: 0, kind: "unchanged" }, count: 1, coverageState: discovered },
      { change: { delta: 1, kind: "new" }, count: 1, coverageState: "Soft 404" },
    ]);
  });

  it("counts a URL that left a reason and a failure that happened after the cutoff", () => {
    const result = reasonCountRows({
      cutoff,
      rows: [
        row("https://example.com/kept", crawled),
        row("https://example.com/failed", crawled, "2026-10-01T00:00:00.000Z", {
          inspectionError: "inspection_failed",
          inspectionFailedAt: "2026-11-05T00:00:00.000Z",
        }),
      ],
      changes: [
        {
          at: new Date("2026-11-04T00:00:00.000Z"),
          next: { coverageState: "Submitted and indexed", verdict: "PASS" },
          previous: { coverageState: crawled, verdict: "FAIL" },
          url: "https://example.com/indexed-again",
        },
      ],
    });
    expect(result.rows).toEqual([
      { change: { delta: -2, kind: "decreased" }, count: 1, coverageState: crawled },
    ]);
  });

  it("omits the change when a stored snapshot cannot be read", () => {
    const result = reasonCountRows({
      cutoff,
      rows: [row("https://example.com/a", crawled, "2026-11-05T00:00:00.000Z")],
      changes: [
        {
          at: new Date("2026-11-05T00:00:00.000Z"),
          next: { coverageState: crawled, verdict: "FAIL" },
          previous: "not-a-snapshot",
          url: "https://example.com/a",
        },
      ],
    });
    expect(result.derived).toBe(false);
    expect(result.rows[0]?.change).toBeNull();
  });
});
