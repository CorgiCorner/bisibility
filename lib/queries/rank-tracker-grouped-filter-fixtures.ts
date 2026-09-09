import type { MarketGridTarget } from "@/lib/keywords/market-grid-model";
export type GroupedFilterLocation = MarketGridTarget["location"];
export type GroupedFilterCheck = {
  checkedAt: string;
  id: string;
  normalizationVersion?: string | null;
  position: number | null;
  rankingUrl: string | null;
  raw: Record<string, unknown>;
  requestedDepth?: number | null;
  status: "completed" | "failed" | "running";
};
export type GroupedFilterTarget = MarketGridTarget & {
  internalId: string;
  publicId: string;
  rankChecks: readonly GroupedFilterCheck[];
};

const us = {
  canonicalKey: "US:en",
  cityName: null,
  countryCode: "US",
  displayName: "United States",
  gl: "us",
  hl: "en",
  id: "location_us",
  kind: "country",
} satisfies GroupedFilterLocation;
const pl = {
  canonicalKey: "PL:pl",
  cityName: null,
  countryCode: "PL",
  displayName: "Poland",
  gl: "pl",
  hl: "pl",
  id: "location_pl",
  kind: "country",
} satisfies GroupedFilterLocation;
type TargetInput = {
  id: string;
  intent: string;
  keyword: string;
  lastCheckStatus: GroupedFilterTarget["lastCheckStatus"];
  location: GroupedFilterLocation;
  position: number;
  positionBaseline: number | null;
  publicId: string;
  rankChecks: readonly GroupedFilterCheck[];
  rankingPages: number;
  rankingUrl: string | null;
  tags: string[];
  targetUrl: string | null;
  topic: string;
  volume: number;
};
function target(input: TargetInput): GroupedFilterTarget {
  const latest = input.rankChecks.at(-1);
  return {
    bestPosition: input.position,
    clicks: null,
    cpc: "0.00",
    createdAt: "2026-09-01T00:00:00.000Z",
    ctr: null,
    dataAsOfAt: "2026-09-03T00:00:00.000Z",
    dataProvider: "fixture",
    device: "Desktop",
    difficulty: 40,
    difficultyKnown: true,
    engine: "Google",
    hasRankData: input.rankChecks.some((check) => check.status === "completed"),
    id: input.publicId,
    impressions: null,
    intent: input.intent,
    internalId: input.id,
    keyword: input.keyword,
    lastCheckAt: latest?.checkedAt ?? null,
    lastCheckErrorCode: null,
    lastCheckStatus: input.lastCheckStatus,
    latestAttemptHealth: input.lastCheckStatus === "failed" ? "failed" : "ok",
    location: input.location,
    locationName: input.location.displayName,
    marketStatus: "active",
    position: input.position,
    positionBaseline: input.positionBaseline,
    positionHistory: [],
    positionHistoryBoundaryAt: null,
    previousPosition: input.positionBaseline,
    publicId: input.publicId,
    rankChecks: input.rankChecks,
    rankingPages: input.rankingPages,
    rankingPath: null,
    rankingUrl: input.rankingUrl,
    rankingUrlHistory: [],
    schedule: {
      cron_expression: null,
      frequency: "daily",
      jitter_minutes: 0,
      last_checked_at: null,
      next_check_at: null,
      timezone: "UTC",
    },
    serpFeatures: input.rankChecks.some((check) => check.raw.feature === "image") ? ["image"] : [],
    sparkline:
      input.positionBaseline === null ? [input.position] : [input.positionBaseline, input.position],
    tags: input.tags,
    targetUrl: input.targetUrl,
    topic: input.topic,
    volume: input.volume,
    volumeKnown: true,
  };
}

const alphaUsChecks: GroupedFilterCheck[] = [
  {
    checkedAt: "2026-09-02T00:00:00.000Z",
    id: "check_alpha_us_previous",
    position: 8,
    rankingUrl: "https://result.example.com/old",
    raw: { difficulty: 40, feature: "image", volume: 21_000 },
    status: "completed",
  },
  {
    checkedAt: "2026-09-03T00:00:00.000Z",
    id: "check_alpha_us_current",
    position: 2,
    rankingUrl: "https://result.example.com/found",
    raw: { difficulty: 40, feature: "image", volume: 21_000 },
    status: "completed",
  },
];

export function groupedFilterFixture() {
  const targets = [
    target({
      id: "keyword_alpha_us",
      intent: "commercial",
      keyword: "Alpha Focus",
      lastCheckStatus: "completed",
      location: us,
      position: 2,
      positionBaseline: 8,
      publicId: "alpha-us",
      rankChecks: alphaUsChecks,
      rankingPages: 2,
      rankingUrl: "https://result.example.com/found",
      tags: ["Growth"],
      targetUrl: "https://needle.example.org/expected",
      topic: "Guide",
      volume: 21_000,
    }),
    target({
      id: "keyword_alpha_pl",
      intent: "informational",
      keyword: "Alpha Focus",
      lastCheckStatus: "failed",
      location: pl,
      position: 20,
      positionBaseline: null,
      publicId: "alpha-pl",
      rankChecks: [
        {
          checkedAt: "2026-09-01T00:00:00.000Z",
          id: "check_alpha_pl_completed",
          position: 20,
          rankingUrl: "https://example.com/alpha",
          raw: { difficulty: 20, volume: 2_000 },
          status: "completed",
        },
        {
          checkedAt: "2026-09-03T00:00:00.000Z",
          id: "check_alpha_pl_failed",
          position: null,
          rankingUrl: null,
          raw: { difficulty: 20, volume: 2_000 },
          status: "failed",
        },
      ],
      rankingPages: 1,
      rankingUrl: "https://example.com/alpha",
      tags: ["Legacy"],
      targetUrl: "https://example.com/alpha",
      topic: "Docs",
      volume: 2_000,
    }),
    target({
      id: "keyword_beta_pl",
      intent: "navigational",
      keyword: "Beta Control",
      lastCheckStatus: "failed",
      location: pl,
      position: 101,
      positionBaseline: null,
      publicId: "beta-pl",
      rankChecks: [
        {
          checkedAt: "2026-09-03T00:00:00.000Z",
          id: "check_beta_pl_failed",
          position: null,
          rankingUrl: null,
          raw: { difficulty: 10, volume: 1_000 },
          status: "failed",
        },
      ],
      rankingPages: 0,
      rankingUrl: null,
      tags: ["Other"],
      targetUrl: "https://example.com/beta",
      topic: "Reference",
      volume: 1_000,
    }),
  ];
  return { locations: [us, pl], projectId: "project_grouped_filters", targets };
}

export function groupedFilterEdgeFixture() {
  const fixture = groupedFilterFixture();
  const boundaryCheck = (
    checkedAt: string,
    id: string,
    position: number | null,
    status: GroupedFilterCheck["status"],
    normalizationVersion = "v2",
  ) => ({
    checkedAt,
    id,
    normalizationVersion,
    position,
    rankingUrl: position === null ? null : "https://example.com/boundary",
    raw: { difficulty: 30, volume: 5_000 },
    requestedDepth: 100,
    status,
  });
  const targets = [
    ...fixture.targets,
    target({
      id: "keyword_zero_volume_us",
      intent: "informational",
      keyword: "Zero Volume",
      lastCheckStatus: "failed",
      location: us,
      position: 6,
      positionBaseline: 6,
      publicId: "zero-volume-us",
      rankChecks: [
        {
          checkedAt: "2026-09-02T00:00:00.000Z",
          id: "check_zero_volume_completed",
          position: 6,
          rankingUrl: "https://example.com/zero-volume",
          raw: { difficulty: 10, volume: 0 },
          status: "completed",
        },
        {
          checkedAt: "2026-09-03T00:00:00.000Z",
          id: "check_zero_volume_failed",
          position: null,
          rankingUrl: null,
          raw: { difficulty: 10, volume: 0 },
          status: "failed",
        },
      ],
      rankingPages: 1,
      rankingUrl: "https://example.com/zero-volume",
      tags: ["Other"],
      targetUrl: "https://example.com/zero-volume",
      topic: "Reference",
      volume: 0,
    }),
    target({
      id: "keyword_boundary_us",
      intent: "informational",
      keyword: "Boundary Date",
      lastCheckStatus: "failed",
      location: us,
      position: 4,
      positionBaseline: null,
      publicId: "boundary-us",
      rankChecks: [
        boundaryCheck("2026-09-01T12:00:00.000Z", "check_boundary_previous", 9, "completed"),
        boundaryCheck(
          "2026-09-02T12:00:00.000Z",
          "check_boundary_normalization",
          2,
          "completed",
          "v1",
        ),
        boundaryCheck("2026-09-03T08:00:00.000Z", "check_boundary_same_day", 10, "completed"),
        boundaryCheck("2026-09-03T12:00:00.000Z", "check_boundary_current", 4, "completed"),
        boundaryCheck("2026-09-04T00:00:00.000Z", "check_boundary_failed", null, "failed"),
      ],
      rankingPages: 1,
      rankingUrl: "https://example.com/boundary",
      tags: ["Other"],
      targetUrl: "https://example.com/boundary",
      topic: "Reference",
      volume: 5_000,
    }),
  ];
  return { ...fixture, targets };
}
