import { aiOverviewState } from "@/lib/checks/retrieved-results-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadRetrievedResultsForChecks,
  storedResultsIndex,
  storedResultsSummaries,
} from "./retrieved-results";

const mocks = vi.hoisted(() => ({
  getRankCheckRawRetentionDays: vi.fn(),
  prisma: {
    $queryRaw: vi.fn(),
    rankCheck: { findMany: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/rank-check/raw-retention", () => ({
  getRankCheckRawRetentionDays: mocks.getRankCheckRawRetentionDays,
}));

const PROJECT_ID = "project_1";
const KEYWORD_PUBLIC_ID = "kw_abcdefghijklmnopqrstuvwx";
const CHECKED_AT = new Date("2026-08-01T12:00:00.000Z");

function indexRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    checkId: "check_1",
    checkedAt: CHECKED_AT,
    position: 3,
    provider: "dataforseo",
    requestedDepth: 10,
    retrieved: 10,
    tier: "full",
    ...overrides,
  };
}

describe("storedResultsIndex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRankCheckRawRetentionDays.mockReturnValue(null);
  });

  it("classifies all four storage tiers from the SQL projection", async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([
      indexRow({ checkId: "check_full", tier: "full", retrieved: 10 }),
      indexRow({ checkId: "check_compact_raw", tier: "compact", retrieved: null, position: 5 }),
      indexRow({ checkId: "check_compact_ranks", tier: "compact", retrieved: null }),
      indexRow({ checkId: "check_none", tier: "none", retrieved: null, position: null }),
    ]);

    const result = await storedResultsIndex({
      keywordPublicId: KEYWORD_PUBLIC_ID,
      projectId: PROJECT_ID,
    });

    expect(result.map((r) => r.tier)).toEqual(["full", "compact", "compact", "none"]);
    expect(result[0]).toMatchObject({ checkId: "check_full", fullDetailUntil: null });
    expect(result[1]).toMatchObject({ checkId: "check_compact_raw", fullDetailUntil: null });
    expect(result[3]).toMatchObject({ checkId: "check_none", position: null });
  });

  it("computes fullDetailUntil as null when retention is unlimited", async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([indexRow({ tier: "full" })]);
    mocks.getRankCheckRawRetentionDays.mockReturnValue(null);

    const [row] = await storedResultsIndex({
      keywordPublicId: KEYWORD_PUBLIC_ID,
      projectId: PROJECT_ID,
    });

    expect(row.fullDetailUntil).toBeNull();
  });

  it("computes fullDetailUntil as a date retentionDays after checkedAt when retention is set", async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([indexRow({ tier: "full" })]);
    mocks.getRankCheckRawRetentionDays.mockReturnValue(90);

    const [row] = await storedResultsIndex({
      keywordPublicId: KEYWORD_PUBLIC_ID,
      projectId: PROJECT_ID,
    });

    expect(row.fullDetailUntil).toBe(new Date("2026-10-30T12:00:00.000Z").toISOString());
  });

  it("leaves fullDetailUntil null for compact and none tiers even with retention", async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([
      indexRow({ tier: "compact", checkId: "c1" }),
      indexRow({ tier: "none", checkId: "c2" }),
    ]);
    mocks.getRankCheckRawRetentionDays.mockReturnValue(90);

    const result = await storedResultsIndex({
      keywordPublicId: KEYWORD_PUBLIC_ID,
      projectId: PROJECT_ID,
    });

    expect(result[0].fullDetailUntil).toBeNull();
    expect(result[1].fullDetailUntil).toBeNull();
  });

  it("defaults limit to 90 and scopes the projection to completed checks", async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([]);
    await storedResultsIndex({ keywordPublicId: KEYWORD_PUBLIC_ID, projectId: PROJECT_ID });
    const call = mocks.prisma.$queryRaw.mock.calls[0]?.[0];
    const sql = String(call?.sql ?? "");

    // Asserting the word LIMIT alone passes for any bound value, including a hardcoded 5.
    expect(call?.values).toContain(90);
    expect(sql).toContain("jsonb_typeof");
    expect(sql).toContain("status");
  });
});

describe("storedResultsSummaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRankCheckRawRetentionDays.mockReturnValue(null);
  });

  it("returns a map keyed by checkId", async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([
      {
        checkId: "check_a",
        checkedAt: CHECKED_AT,
        requestedDepth: 10,
        tier: "full",
        retrieved: 10,
      },
      {
        checkId: "check_b",
        checkedAt: CHECKED_AT,
        requestedDepth: 10,
        tier: "compact",
        retrieved: null,
      },
    ]);

    const map = await storedResultsSummaries({
      checkIds: ["check_a", "check_b"],
      projectId: PROJECT_ID,
    });

    expect(map.get("check_a")?.tier).toBe("full");
    expect(map.get("check_b")?.tier).toBe("compact");
  });

  it("returns an empty map for an empty checkIds array", async () => {
    const map = await storedResultsSummaries({ checkIds: [], projectId: PROJECT_ID });
    expect(map.size).toBe(0);
    expect(mocks.prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe("loadRetrievedResultsForChecks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRankCheckRawRetentionDays.mockReturnValue(null);
  });

  it("classifies all four storage cases in TypeScript", async () => {
    mocks.prisma.rankCheck.findMany.mockResolvedValue([
      {
        checkedAt: CHECKED_AT,
        organicRanks: null,
        position: 3,
        provider: "dataforseo",
        publicId: "check_full",
        raw: {
          organic_results: [
            { domain: "example.com", rank: 1, title: "Example", url: "https://example.com" },
            { domain: "example.org", rank: 3, title: "Example Org", url: "https://example.org" },
          ],
          serp_features: [],
        },
        requestedDepth: 10,
      },
      {
        checkedAt: CHECKED_AT,
        organicRanks: null,
        position: 5,
        provider: "dataforseo",
        publicId: "check_legacy",
        raw: {
          organic_results: undefined,
          tasks: [{ result: [{ items: [{ domain: "example.com", rank: 5 }] }] }],
        },
        requestedDepth: 10,
      },
      {
        checkedAt: CHECKED_AT,
        organicRanks: [{ domain: "example.com", position: 2 }],
        position: 2,
        provider: "dataforseo",
        publicId: "check_compact",
        raw: null,
        requestedDepth: 10,
      },
      {
        checkedAt: CHECKED_AT,
        organicRanks: null,
        position: null,
        provider: "dataforseo",
        publicId: "check_none",
        raw: null,
        requestedDepth: null,
      },
    ]);

    const result = await loadRetrievedResultsForChecks({
      checkIds: ["check_full", "check_legacy", "check_compact", "check_none"],
      projectId: PROJECT_ID,
    });

    expect(result.map((r) => r.tier)).toEqual(["full", "compact", "compact", "none"]);
  });

  it("sets retrievedPositions to the max rank when ranks have a hole", async () => {
    mocks.prisma.rankCheck.findMany.mockResolvedValue([
      {
        checkedAt: CHECKED_AT,
        organicRanks: null,
        position: 5,
        provider: "dataforseo",
        publicId: "check_1",
        raw: {
          organic_results: [
            { domain: "example.com", rank: 1 },
            { domain: "example.org", rank: 3 },
            { domain: "sub2.example.org", rank: 5 },
          ],
          serp_features: [],
        },
        requestedDepth: 10,
      },
    ]);

    const [result] = await loadRetrievedResultsForChecks({
      checkIds: ["check_1"],
      projectId: PROJECT_ID,
    });

    expect(result.tier).toBe("full");
    if (result.tier === "full") {
      expect(result.retrievedPositions).toBe(5);
    }
  });

  it("marks exactly the row whose rank equals position as tracked", async () => {
    mocks.prisma.rankCheck.findMany.mockResolvedValue([
      {
        checkedAt: CHECKED_AT,
        organicRanks: null,
        position: 3,
        provider: "dataforseo",
        publicId: "check_1",
        raw: {
          organic_results: [
            { domain: "example.com", rank: 1 },
            { domain: "example.org", rank: 2 },
            { domain: "sub2.example.org", rank: 3 },
          ],
          serp_features: [],
        },
        requestedDepth: 10,
      },
    ]);

    const [result] = await loadRetrievedResultsForChecks({
      checkIds: ["check_1"],
      projectId: PROJECT_ID,
    });

    if (result.tier === "full") {
      expect(result.rows.map((r) => r.tracked)).toEqual([false, false, true]);
    }
  });

  it("sets aiOverview to null for a serpapi check even when features are present", async () => {
    mocks.prisma.rankCheck.findMany.mockResolvedValue([
      {
        checkedAt: CHECKED_AT,
        organicRanks: null,
        position: 1,
        provider: "serpapi",
        publicId: "check_serpapi",
        raw: {
          organic_results: [{ domain: "example.com", rank: 1 }],
          serp_features: ["ai overview", "sitelinks"],
        },
        requestedDepth: 10,
      },
    ]);

    const [result] = await loadRetrievedResultsForChecks({
      checkIds: ["check_serpapi"],
      projectId: PROJECT_ID,
    });

    if (result.tier === "full") {
      expect(result.aiOverview).toBeNull();
      expect(result.features).toEqual(["ai overview", "sitelinks"]);
    }
  });

  it("sets aiOverview to true for dataforseo when ai overview is in features", async () => {
    mocks.prisma.rankCheck.findMany.mockResolvedValue([
      {
        checkedAt: CHECKED_AT,
        organicRanks: null,
        position: 1,
        provider: "dataforseo",
        publicId: "check_dfs",
        raw: {
          organic_results: [{ domain: "example.com", rank: 1 }],
          serp_features: ["ai overview"],
        },
        requestedDepth: 10,
      },
    ]);

    const [result] = await loadRetrievedResultsForChecks({
      checkIds: ["check_dfs"],
      projectId: PROJECT_ID,
    });

    if (result.tier === "full") {
      expect(result.aiOverview).toBe(true);
    }
  });

  it("computes fullDetailUntil with retention for full tier", async () => {
    mocks.getRankCheckRawRetentionDays.mockReturnValue(30);
    mocks.prisma.rankCheck.findMany.mockResolvedValue([
      {
        checkedAt: CHECKED_AT,
        organicRanks: null,
        position: 1,
        provider: "dataforseo",
        publicId: "check_1",
        raw: {
          organic_results: [{ domain: "example.com", rank: 1 }],
          serp_features: [],
        },
        requestedDepth: 10,
      },
    ]);

    const [result] = await loadRetrievedResultsForChecks({
      checkIds: ["check_1"],
      projectId: PROJECT_ID,
    });

    if (result.tier === "full") {
      expect(result.fullDetailUntil).toBe(new Date("2026-08-31T12:00:00.000Z").toISOString());
    }
  });

  it("computes expiredAt for compact tier the same way as fullDetailUntil", async () => {
    mocks.getRankCheckRawRetentionDays.mockReturnValue(30);
    mocks.prisma.rankCheck.findMany.mockResolvedValue([
      {
        checkedAt: CHECKED_AT,
        organicRanks: [{ domain: "example.com", position: 1 }],
        position: 1,
        provider: "dataforseo",
        publicId: "check_1",
        raw: null,
        requestedDepth: 10,
      },
    ]);

    const [result] = await loadRetrievedResultsForChecks({
      checkIds: ["check_1"],
      projectId: PROJECT_ID,
    });

    if (result.tier === "compact") {
      expect(result.expiredAt).toBe(new Date("2026-08-31T12:00:00.000Z").toISOString());
      expect(result.domains).toEqual([{ bestPosition: 1, domain: "example.com" }]);
    }
  });

  it("sets stoppedAtResult when normalization matched and retrieved is less than requestedDepth", async () => {
    mocks.prisma.rankCheck.findMany.mockResolvedValue([
      {
        checkedAt: CHECKED_AT,
        organicRanks: null,
        position: 3,
        provider: "dataforseo",
        publicId: "check_1",
        raw: {
          organic_results: [
            { domain: "example.com", rank: 1 },
            { domain: "example.org", rank: 2 },
            { domain: "sub2.example.org", rank: 3 },
          ],
          normalization: { outcome: "match" },
          serp_features: [],
        },
        requestedDepth: 10,
      },
    ]);

    const [result] = await loadRetrievedResultsForChecks({
      checkIds: ["check_1"],
      projectId: PROJECT_ID,
    });

    if (result.tier === "full") {
      expect(result.stoppedAtResult).toBe(true);
    }
  });

  it("sets stoppedAtResult to false when normalization did not match", async () => {
    mocks.prisma.rankCheck.findMany.mockResolvedValue([
      {
        checkedAt: CHECKED_AT,
        organicRanks: null,
        position: 3,
        provider: "dataforseo",
        publicId: "check_1",
        raw: {
          organic_results: [{ domain: "example.com", rank: 3 }],
          normalization: { outcome: "no_match" },
          serp_features: [],
        },
        requestedDepth: 10,
      },
    ]);

    const [result] = await loadRetrievedResultsForChecks({
      checkIds: ["check_1"],
      projectId: PROJECT_ID,
    });

    if (result.tier === "full") {
      expect(result.stoppedAtResult).toBe(false);
    }
  });

  it("returns an empty array for an empty checkIds list", async () => {
    const result = await loadRetrievedResultsForChecks({
      checkIds: [],
      projectId: PROJECT_ID,
    });
    expect(result).toEqual([]);
    expect(mocks.prisma.rankCheck.findMany).not.toHaveBeenCalled();
  });

  it("separates a provider that reports no AI overview from one that cannot report it", async () => {
    // aiOverviewFor once returned null for both, which erased the distinction C9 exists for.
    expect(aiOverviewState("dataforseo", ["featured snippet"])).toBe(false);
    expect(aiOverviewState("dataforseo", ["ai overview"])).toBe(true);
    expect(aiOverviewState("serpapi", ["answer box"])).toBeNull();
  });
});
