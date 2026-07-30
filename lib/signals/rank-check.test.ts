import { describe, expect, it } from "vitest";
import { type RankCheckSignalArgs, signalsForRankCheck } from "./rank-check";
import { SIGNAL_TYPES } from "./types";

const checkedAt = new Date("2026-07-04T19:30:00.000Z");

function rankCheckArgs(overrides: Partial<RankCheckSignalArgs> = {}): RankCheckSignalArgs {
  return {
    checkedAt,
    keywordId: "keyword_1",
    position: 8,
    previousPosition: 8,
    previousRankingUrl: "https://example.com/docs",
    projectId: "project_1",
    rankCheckId: "rank_check_1",
    requestedDepth: 50,
    rankingUrl: "https://example.com/docs",
    targetUrl: "https://example.com/docs",
    ...overrides,
  };
}

describe("signalsForRankCheck", () => {
  it("returns no signals when position and ranking URL are unchanged", () => {
    expect(signalsForRankCheck(rankCheckArgs())).toEqual([]);
  });

  it.each([
    ["improvement", 10, 3, "info", 7],
    ["decline", 3, 10, "warning", -7],
  ] as const)("emits an %s ranking.changed signal", (_label, before, after, severity, delta) => {
    expect(
      signalsForRankCheck(
        rankCheckArgs({
          position: after,
          previousPosition: before,
        }),
      ),
    ).toEqual([
      expect.objectContaining({
        happenedAt: checkedAt,
        keywordId: "keyword_1",
        payload: { after, before, delta, rankCheckId: "rank_check_1", requestedDepth: 50 },
        projectId: "project_1",
        severity,
        source: "rank_tracker",
        type: SIGNAL_TYPES.rankingChanged,
      }),
    ]);
  });

  it.each([
    ["entered", null, 9, "info"],
    ["dropped out", 9, null, "warning"],
  ] as const)("emits an %s ranking.changed signal", (_label, before, after, severity) => {
    expect(
      signalsForRankCheck(
        rankCheckArgs({
          position: after,
          previousPosition: before,
        }),
      )[0],
    ).toMatchObject({
      payload: { after, before, delta: null, rankCheckId: "rank_check_1", requestedDepth: 50 },
      severity,
      type: SIGNAL_TYPES.rankingChanged,
    });
  });

  it("emits info when a changed ranking URL now matches the target URL", () => {
    expect(
      signalsForRankCheck(
        rankCheckArgs({
          previousRankingUrl: "https://example.com/old",
          rankingUrl: "https://www.example.com/docs/",
          targetUrl: "http://example.com/docs",
        }),
      ),
    ).toEqual([
      expect.objectContaining({
        payload: {
          after: "https://www.example.com/docs/",
          before: "https://example.com/old",
          matchesTargetUrl: true,
          requestedDepth: 50,
        },
        severity: "info",
        type: SIGNAL_TYPES.rankingUrlChanged,
        url: "https://www.example.com/docs/",
      }),
    ]);
  });

  it("emits warning when a changed ranking URL stops matching the target URL", () => {
    expect(
      signalsForRankCheck(
        rankCheckArgs({
          previousRankingUrl: "https://example.com/docs",
          rankingUrl: "https://example.com/other",
          targetUrl: "https://www.example.com/docs/",
        }),
      )[0],
    ).toMatchObject({
      payload: {
        after: "https://example.com/other",
        before: "https://example.com/docs",
        matchesTargetUrl: false,
        requestedDepth: 50,
      },
      severity: "warning",
      type: SIGNAL_TYPES.rankingUrlChanged,
    });
  });

  it("emits info with a null target match when no target URL is set", () => {
    expect(
      signalsForRankCheck(
        rankCheckArgs({
          previousRankingUrl: "https://example.com/docs",
          rankingUrl: "https://example.com/other",
          targetUrl: null,
        }),
      )[0],
    ).toMatchObject({
      payload: expect.objectContaining({ matchesTargetUrl: null }),
      severity: "info",
      type: SIGNAL_TYPES.rankingUrlChanged,
    });
  });

  it("does not emit URL signals for protocol, www, query, hash, or trailing slash changes", () => {
    expect(
      signalsForRankCheck(
        rankCheckArgs({
          previousRankingUrl: "http://www.example.com/docs/?utm=1#top",
          rankingUrl: "https://example.com/docs",
        }),
      ),
    ).toEqual([]);
  });

  it("emits both ranking and URL signals when both values change", () => {
    const signals = signalsForRankCheck(
      rankCheckArgs({
        position: 12,
        previousPosition: 8,
        previousRankingUrl: "https://example.com/docs",
        rankingUrl: "https://example.com/other",
      }),
    );

    expect(signals).toHaveLength(2);
    expect(signals.map((signal) => signal.type)).toEqual([
      SIGNAL_TYPES.rankingChanged,
      SIGNAL_TYPES.rankingUrlChanged,
    ]);
  });
});
