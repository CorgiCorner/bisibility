import type { RetrievedResults } from "@/lib/checks/contract";
import {
  AI_OVERVIEW_REPORTING_PROVIDERS,
  aiOverviewState,
  compareChecks,
  featureChips,
  gapBlock,
  retentionFooter,
  retrievedPositionsOf,
} from "@/lib/checks/retrieved-results-model";
import { describe, expect, it } from "vitest";

function fullResults(
  overrides: Partial<Extract<RetrievedResults, { tier: "full" }> & Record<string, unknown>> = {},
): Extract<RetrievedResults, { tier: "full" }> {
  return {
    checkId: "c1",
    checkedAt: "2025-01-01T00:00:00Z",
    provider: "dataforseo",
    providerLabel: "DataForSEO",
    tier: "full",
    requestedDepth: 10,
    retrievedPositions: 10,
    trackedPosition: null,
    stoppedAtResult: false,
    rows: [],
    features: [],
    aiOverview: null,
    fullDetailUntil: null,
    ...overrides,
  };
}

const fmt = (iso: string) => iso.slice(0, 10);

describe("retrieved-results-model", () => {
  it("featureChips maps typed provider features, deduplicates known features, and preserves unknown raw values", () => {
    const chips = featureChips([
      "ai overview",
      "answer box",
      "local results",
      "local pack",
      "some weird thing",
    ]);
    const known = chips.map((chip) => chip.known);
    expect(known).toContain("aiOverview");
    expect(known).toContain("featuredSnippet");
    const local = known.filter((value) => value === "localPack");
    expect(local).toHaveLength(1);
    expect(chips).toContainEqual({ known: null, raw: "some weird thing" });
  });

  it("aiOverviewState returns true, false, and null for the three cases", () => {
    expect(aiOverviewState("dataforseo", ["ai overview"])).toBe(true);
    expect(aiOverviewState("dataforseo", ["paid"])).toBe(false);
    expect(aiOverviewState("other", ["ai overview"])).toBeNull();
    expect(AI_OVERVIEW_REPORTING_PROVIDERS).toEqual(["dataforseo"]);
  });

  it("retrievedPositionsOf returns the max position when ranks have a hole", () => {
    const rows = [
      { position: 1, domain: "example.com", url: null, title: null, tracked: true },
      { position: 2, domain: "a.example.org", url: null, title: null, tracked: false },
      { position: 5, domain: "b.example.org", url: null, title: null, tracked: false },
    ];
    expect(retrievedPositionsOf(rows)).toBe(5);
  });

  it("gapBlock returns null when retrievedPositions equals requestedDepth", () => {
    expect(
      gapBlock({ requestedDepth: 10, retrievedPositions: 10, stoppedAtResult: false }),
    ).toBeNull();
  });

  it("uses persisted stoppedAtResult evidence for the gap reason", () => {
    const stopped = gapBlock({
      requestedDepth: 10,
      retrievedPositions: 5,
      stoppedAtResult: true,
    });
    expect(stopped).toEqual({ count: 5, end: 10, kind: "stopped", start: 6 });

    const notStopped = gapBlock({
      requestedDepth: 10,
      retrievedPositions: 5,
      stoppedAtResult: false,
    });
    expect(notStopped).toEqual({ count: 5, end: 10, kind: "unknown", start: 6 });
  });

  it("retentionFooter produces the unlimited sentence for a null date and interpolates the injected formatter and day count otherwise", () => {
    expect(retentionFooter({ fullDetailUntil: null, formatDate: fmt, retentionDays: 30 })).toBe(
      "Full detail for this check is kept for as long as you keep the database.",
    );
    const text = retentionFooter({
      fullDetailUntil: "2025-02-01T00:00:00Z",
      formatDate: fmt,
      retentionDays: 31,
    });
    expect(text).toContain("2025-02-01");
    expect(text).toContain("31 days after it ran");
  });

  it("compareChecks returns typed refusal data for compact and unavailable checks", () => {
    const compact = {
      checkId: "c2",
      checkedAt: "2024-06-01T00:00:00Z",
      provider: "dataforseo",
      providerLabel: "DataForSEO",
      tier: "compact" as const,
      domains: [],
      expiredAt: null,
    };
    const from = fullResults();
    const result = compareChecks(from, compact, {
      formatDate: fmt,
      fullCheckDates: ["2025-01-01T00:00:00Z"],
    });
    expect(result.kind).toBe("refused");
    if (result.kind !== "refused") return;
    expect(result).toMatchObject({ kept: 0, relation: "earlier", tier: "compact" });

    const none = {
      checkId: "c3",
      checkedAt: "2024-06-01T00:00:00Z",
      provider: "dataforseo",
      providerLabel: "DataForSEO",
      tier: "none" as const,
    };
    const result2 = compareChecks(fullResults(), none, {
      formatDate: fmt,
      fullCheckDates: [],
    });
    expect(result2.kind).toBe("refused");
    if (result2.kind !== "refused") return;
    expect(result2).toMatchObject({ tier: "none" });
  });

  it("compareChecks returns a typed degenerate state when overlap is below 3", () => {
    const from = fullResults({ retrievedPositions: 2, rows: [] });
    const to = fullResults({ retrievedPositions: 2, rows: [] });
    const result = compareChecks(from, to, { formatDate: fmt, fullCheckDates: [] });
    expect(result.kind).toBe("degenerate");
    if (result.kind !== "degenerate") return;
    expect(result).toMatchObject({ reason: "insufficient_overlap" });
  });

  it("compareChecks keeps comparison state and bounds as typed data", () => {
    const fromRows = [
      { position: 1, domain: "a.example.org", url: null, title: null, tracked: false },
      { position: 2, domain: "b.example.org", url: null, title: null, tracked: false },
      { position: 3, domain: "c.example.org", url: null, title: null, tracked: false },
      { position: 4, domain: "d.example.org", url: null, title: null, tracked: false },
      { position: 5, domain: "e.example.org", url: null, title: null, tracked: false },
      { position: 12, domain: "example.com", url: null, title: null, tracked: true },
    ];
    const toRows = [
      { position: 1, domain: "b.example.org", url: null, title: null, tracked: false },
      { position: 2, domain: "a.example.org", url: null, title: null, tracked: false },
      { position: 3, domain: "c.example.org", url: null, title: null, tracked: false },
      { position: 4, domain: "f.example.org", url: null, title: null, tracked: false },
      { position: 5, domain: "example.com", url: null, title: null, tracked: true },
    ];
    const from = fullResults({
      checkedAt: "2025-01-01T00:00:00Z",
      retrievedPositions: 12,
      trackedPosition: 12,
      stoppedAtResult: true,
      rows: fromRows,
    });
    const to = fullResults({
      checkedAt: "2025-01-08T00:00:00Z",
      retrievedPositions: 5,
      trackedPosition: 5,
      stoppedAtResult: true,
      rows: toRows,
    });
    const result = compareChecks(from, to, { formatDate: fmt, fullCheckDates: [] });
    expect(result.kind).toBe("list");
    if (result.kind !== "list") return;
    expect(result.overlap).toBe(5);
    expect(result.bound).toEqual({ kind: "stopped", overlap: 5, relation: "later" });
    expect(result.stats.entered).toBe(2);
    expect(result.stats.up).toBe(1);
    expect(result.stats.down).toBe(1);
    expect(result.stats.unchanged).toBe(1);
    expect(result.stats.dropped_out).toBe(2);
    const total =
      result.stats.entered +
      result.stats.up +
      result.stats.down +
      result.stats.unchanged +
      result.stats.dropped_out;
    expect(total).toBe(result.rows.length);
  });

  it("blames the shallower check for the tail, not always the later one", () => {
    // The earlier check stopped at the tracked result; the later one crawled the full depth.
    // Saying "the later check stopped at your result" would be a causal claim about the
    // wrong check, and "was not retrieved" would be false for a position that was.
    const from = fullResults({
      retrievedPositions: 5,
      rows: [1, 2, 3, 4, 5].map((position) => ({
        domain: `sub${position}.example.org`,
        position,
        title: null,
        tracked: false,
        url: null,
      })),
      stoppedAtResult: true,
    });
    const to = fullResults({
      retrievedPositions: 100,
      rows: [1, 2, 3, 4, 40].map((position) => ({
        domain: `sub${position === 40 ? 5 : position}.example.org`,
        position,
        title: null,
        tracked: false,
        url: null,
      })),
      stoppedAtResult: false,
    });
    const result = compareChecks(from, to, { formatDate: (iso) => iso, fullCheckDates: [] });

    if (result.kind !== "list") throw new Error("expected a list");
    expect(result.bound).toEqual({ kind: "stopped", overlap: 5, relation: "earlier" });
    const dropped = result.rows.find((row) => row.state === "dropped_out");
    expect(dropped).toMatchObject({ from: 5, state: "dropped_out", to: null });
  });

  it("keys a domain by its best position when it ranks twice", () => {
    const from = fullResults({
      retrievedPositions: 10,
      rows: [
        { domain: "example.org", position: 2, title: null, tracked: false, url: null },
        { domain: "example.org", position: 7, title: null, tracked: false, url: null },
      ],
    });
    const to = fullResults({
      retrievedPositions: 10,
      rows: [{ domain: "example.org", position: 2, title: null, tracked: false, url: null }],
    });
    const result = compareChecks(from, to, { formatDate: (iso) => iso, fullCheckDates: [] });

    if (result.kind !== "list") throw new Error("expected a list");
    expect(result.rows[0]?.state).toBe("unchanged");
  });
});
