import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadRankTrackerAiOverviewList } from "./rank-tracker-ai-overview-list";
import type { RankTrackerReportOptions } from "./rank-tracker-report-model";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  transaction: vi.fn(),
  queryRaw: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}));
vi.mock("./rank-tracker-report-selection", () => ({
  selectRankTrackerReportKeywordsInTransaction: mocks.select,
}));
vi.mock("./_auth", () => ({
  requireReadableProject: async () => ({
    actor: { id: "verified-session" },
    project: { id: "internal-project" },
  }),
}));

const project = "prj_abcdefghijklmnopqrstuvwx";
const rows = Array.from({ length: 30 }, (_, index) => ({
  id: `kw_${String(index).padStart(24, "a")}`,
  device: index % 2 === 0 ? "desktop" : "mobile",
}));

function options(): RankTrackerReportOptions {
  return {
    asOf: new Date("2026-11-09T07:11:00.000Z"),
    limits: { maxTargets: 100, maxItems: 1000, maxChecks: 1000 },
    policyAt: () => ({}) as never,
    loadMetadata: async () => new Map(),
  };
}

describe("loadRankTrackerAiOverviewList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryRaw.mockResolvedValue([]);
    mocks.transaction.mockImplementation((read: (tx: unknown) => unknown) =>
      read({ $executeRaw: vi.fn(), $queryRaw: mocks.queryRaw }),
    );
    mocks.select.mockResolvedValue({
      rows,
      project: { id: "internal-project", domain: "example.com" },
      evaluation: "shared_kernel",
      facets: { intents: [], positions: [], tags: [], topics: [] },
      locations: [],
      report: undefined,
      selectedKeywordIds: rows.map((row) => row.id),
      selectionDigest: "digest",
      totalCount: rows.length,
    });
  });

  it("reads overview fragments only for the current page and keeps the organic selector", async () => {
    const result = await loadRankTrackerAiOverviewList(
      project,
      {
        ...defaultRankTrackerQueryState,
        pageSize: 25,
        reportScope: { view: "ai_overviews", subject: null, comparisonDays: 7, asOf: null },
      },
      options(),
    );
    expect(result.mode).toBe("flat-server");
    if (result.mode !== "flat-server") return;
    expect(result.rows).toHaveLength(25);
    expect(result.aiOverview.facts).toEqual([]);
    expect(result.query.reportScope?.view).toBe("ai_overviews");
    const loaded = JSON.stringify(mocks.queryRaw.mock.calls[0]?.[0]?.values ?? []);
    expect(loaded).toContain(rows[0]?.id);
    expect(loaded).not.toContain(rows[29]?.id);
    const asked = mocks.select.mock.calls[0]?.[2] as {
      query?: { reportScope?: { view?: string } };
    };
    expect(asked.query?.reportScope?.view).toBe("general");
  });
});
