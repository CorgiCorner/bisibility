import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { deriveKeywordDetailState } from "@/lib/keyword-detail/state-model";
import type { KeywordTrafficDetail } from "@/lib/queries/keyword-traffic";
import type { KeywordRow } from "@/lib/queries/keywords";
import { describe, expect, it } from "vitest";

function keyword(overrides: Partial<KeywordRow> = {}): KeywordRow {
  return { ...keywordRows[0], ...overrides };
}

const query = {
  clicks: 12,
  ctr: 0.1,
  date: new Date("2026-08-10T00:00:00.000Z"),
  impressions: 120,
  position: 3,
  provider: "gsc",
  windowDays: 28,
};

const page = {
  bounceRate: null,
  date: query.date,
  engagementRate: null,
  keyEvents: null,
  path: "/headless-cms",
  provider: "ga4",
  scrollDepth: null,
  sessions: 8,
  visitDurationSeconds: null,
  visitors: null,
  windowDays: 28,
};

function traffic(overrides: Partial<KeywordTrafficDetail> = {}): KeywordTrafficDetail {
  return {
    hasAnalyticsConnection: true,
    hasSearchConsoleConnection: true,
    pages: [page],
    query,
    ...overrides,
  };
}

describe("deriveKeywordDetailState", () => {
  it.each([
    ["ranked", "normal"],
    ["never_checked", "never_checked"],
    ["not_ranked", "not_ranked"],
    ["failed", "failed"],
    ["running", "running"],
  ] as const)("maps %s to the %s rank state", (checkState, rankState) => {
    expect(
      deriveKeywordDetailState(
        keyword({
          checkState,
          hasRankData: checkState === "ranked",
          position: checkState === "ranked" ? 3 : 101,
        }),
        traffic(),
      ).rankState,
    ).toBe(rankState);
  });

  it("keeps chart, context, traffic, and first-check state independent", () => {
    const state = deriveKeywordDetailState(
      keyword({
        checkState: "ranked",
        cpcKnown: false,
        difficultyKnown: false,
        hasRankData: true,
        positionHistory: [{ checkedAt: "2026-08-10T10:00:00.000Z", label: "Today", position: 3 }],
        rankingUrlHistory: [
          {
            endAt: "2026-08-09T00:00:00.000Z",
            isCurrent: false,
            note: null,
            position: 4,
            requestedDepth: 20,
            startAt: "2026-08-09T00:00:00.000Z",
            url: "https://example.com/old",
          },
          {
            endAt: "2026-08-10T00:00:00.000Z",
            isCurrent: true,
            note: null,
            position: 3,
            requestedDepth: 20,
            startAt: "2026-08-10T00:00:00.000Z",
            url: "https://example.com/new",
          },
        ],
      }),
      traffic({ pages: [], query }),
    );

    expect(state).toMatchObject({
      chartState: "one_check",
      keywordContext: "partial",
      rankState: "normal",
      trafficState: "gsc_only",
      whatChanged: "first_check",
    });
  });

  it("distinguishes every traffic state without changing the rank state", () => {
    const normal = { checkState: "ranked" as const, hasRankData: true };

    expect(deriveKeywordDetailState(keyword({ ...normal }), traffic()).trafficState).toBe("both");
    expect(
      deriveKeywordDetailState(keyword({ ...normal }), traffic({ pages: [], query })).trafficState,
    ).toBe("gsc_only");
    expect(
      deriveKeywordDetailState(keyword({ ...normal }), traffic({ pages: [], query: null }))
        .trafficState,
    ).toBe("awaiting_sync");
    expect(
      deriveKeywordDetailState(
        keyword({ ...normal }),
        traffic({
          hasAnalyticsConnection: true,
          hasSearchConsoleConnection: false,
          pages: [],
          query: null,
        }),
      ).trafficState,
    ).toBe("not_connected");
  });

  it("treats one completed rank observation as a first check", () => {
    expect(
      deriveKeywordDetailState(
        keyword({
          positionHistory: [{ checkedAt: "2026-08-10T10:00:00.000Z", label: "Today", position: 3 }],
          rankingUrlHistory: [
            {
              endAt: "2026-08-10T10:00:00.000Z",
              isCurrent: true,
              note: "Current",
              position: 3,
              requestedDepth: 20,
              startAt: "2026-08-10T10:00:00.000Z",
              url: "https://example.com/rank-tracker",
            },
          ],
        }),
        traffic(),
      ).whatChanged,
    ).toBe("first_check");
  });

  it("detects a rank change across multiple checks even when the ranking URL is stable", () => {
    expect(
      deriveKeywordDetailState(
        keyword({
          positionHistory: [
            { checkedAt: "2026-08-09T10:00:00.000Z", label: "Yesterday", position: 5 },
            { checkedAt: "2026-08-10T10:00:00.000Z", label: "Today", position: 3 },
          ],
          rankingUrlHistory: [
            {
              endAt: "2026-08-10T10:00:00.000Z",
              isCurrent: true,
              note: "Current",
              position: 3,
              requestedDepth: 20,
              startAt: "2026-08-09T10:00:00.000Z",
              url: "https://example.com/rank-tracker",
            },
          ],
        }),
        traffic(),
      ).whatChanged,
    ).toBe("diff");
  });

  it("reports no change when multiple completed checks preserve rank and URL", () => {
    expect(
      deriveKeywordDetailState(
        keyword({
          positionHistory: [
            { checkedAt: "2026-08-09T10:00:00.000Z", label: "Yesterday", position: 3 },
            { checkedAt: "2026-08-10T10:00:00.000Z", label: "Today", position: 3 },
          ],
          rankingUrlHistory: [
            {
              endAt: "2026-08-10T10:00:00.000Z",
              isCurrent: true,
              note: "Current",
              position: 3,
              requestedDepth: 20,
              startAt: "2026-08-09T10:00:00.000Z",
              url: "https://example.com/rank-tracker",
            },
          ],
        }),
        traffic(),
      ).whatChanged,
    ).toBe("no_change");
  });

  it("compares only the latest two completed comparable URL observations", () => {
    expect(
      deriveKeywordDetailState(
        keyword({
          completedComparableChecks: [
            {
              checkedAt: "2026-08-07T10:00:00.000Z",
              position: 3,
              rankingUrl: "https://example.com/a",
            },
            {
              checkedAt: "2026-08-08T10:00:00.000Z",
              position: 3,
              rankingUrl: "https://example.com/b",
            },
            {
              checkedAt: "2026-08-09T10:00:00.000Z",
              position: 3,
              rankingUrl: "https://example.com/b",
            },
            {
              checkedAt: "2026-08-10T10:00:00.000Z",
              position: 3,
              rankingUrl: "https://example.com/b",
            },
          ],
          positionHistory: [
            { checkedAt: "2026-08-07T10:00:00.000Z", label: "Aug 7", position: 3 },
            { checkedAt: "2026-08-08T10:00:00.000Z", label: "Aug 8", position: 3 },
            { checkedAt: "2026-08-09T10:00:00.000Z", label: "Aug 9", position: 3 },
            { checkedAt: "2026-08-10T10:00:00.000Z", label: "Today", position: 3 },
          ],
          rankingUrlHistory: [
            {
              endAt: "2026-08-07T10:00:00.000Z",
              isCurrent: false,
              note: "First seen ranking",
              position: 3,
              requestedDepth: 20,
              startAt: "2026-08-07T10:00:00.000Z",
              url: "https://example.com/a",
            },
            {
              endAt: "2026-08-10T10:00:00.000Z",
              isCurrent: true,
              note: "Current",
              position: 3,
              requestedDepth: 20,
              startAt: "2026-08-08T10:00:00.000Z",
              url: "https://example.com/b",
            },
          ],
        } as Partial<KeywordRow>),
        traffic(),
      ).whatChanged,
    ).toBe("no_change");
  });

  it("reports a URL change when the latest comparable observations switch URLs", () => {
    expect(
      deriveKeywordDetailState(
        keyword({
          completedComparableChecks: [
            {
              checkedAt: "2026-08-09T10:00:00.000Z",
              position: 3,
              rankingUrl: "https://example.com/a",
            },
            {
              checkedAt: "2026-08-10T10:00:00.000Z",
              position: 3,
              rankingUrl: "https://example.com/b",
            },
          ],
          positionHistory: [
            { checkedAt: "2026-08-09T10:00:00.000Z", label: "Yesterday", position: 3 },
            { checkedAt: "2026-08-10T10:00:00.000Z", label: "Today", position: 3 },
          ],
        } as Partial<KeywordRow>),
        traffic(),
      ).whatChanged,
    ).toBe("diff");
  });
});
