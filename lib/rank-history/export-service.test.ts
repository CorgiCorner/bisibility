import { historicKeywordFixture } from "@/lib/actions/keyword-export-test-fixtures";
import { AuthorizationError } from "@/lib/auth/authorize";
import { reportAsOf } from "@/lib/rank-reports/report-test-fixture";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { configureHistoryExportDatabase } from "./export-database.test-fixture";
import {
  loadRankHistoryExport,
  rankHistoryCsvHeader,
  rankHistoryCsvLine,
  rankHistoryRows,
} from "./export-service";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    rankCheck: { count: vi.fn(), findMany: vi.fn() },
    keyword: { findMany: vi.fn() },
    project: { findFirst: vi.fn() },
  },
  writeAudit: vi.fn(),
  writeAuditFailure: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./export-host", async () => {
  const { reportPolicy } = await import("@/lib/rank-reports/report-test-fixture");
  return {
    historyExportReportOptions: (_context: unknown, asOf = new Date()) => ({
      asOf,
      limits: { maxTargets: 1000, maxChecks: 1000, maxItems: 1000 },
      policyAt: (at: Date) => ({ ...reportPolicy(), asOf: at }),
      loadMetadata: async () => new Map(),
    }),
  };
});
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.writeAudit,
  writeAuditFailure: mocks.writeAuditFailure,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const actor = { id: "user_1", memberships: [{ projectId: "project_1", role: "viewer" as const }] };
const CHECK_PUBLIC_ID = "check_abcdefghijklmnopqrstuvwx";
const CHECK_PUBLIC_ID_2 = "check_bbcdefghijklmnopqrstuvwx";
const KEYWORD_PUBLIC_ID = "kw_abcdefghijklmnopqrstuvwx";
const PROJECT_PUBLIC_ID = "prj_abcdefghijklmnopqrstuvwx";

describe("rank-history export core", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(reportAsOf);
    configureHistoryExportDatabase(mocks.prisma);
    mocks.writeAuditFailure.mockResolvedValue(undefined);
    mocks.prisma.project.findFirst.mockResolvedValue({
      id: "project_1",
      publicId: PROJECT_PUBLIC_ID,
    });
    mocks.prisma.keyword.findMany.mockResolvedValue([
      {
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        id: "keyword_1",
        publicId: KEYWORD_PUBLIC_ID,
        rankChecks: [
          {
            checkedAt: new Date("2026-07-20T10:00:00.000Z"),
            id: "check_2",
            normalizationVersion: "v1",
            position: 4,
            previousPosition: 7,
            provider: "dataforseo",
            publicId: CHECK_PUBLIC_ID_2,
            rankingUrl: "https://example.com/rank,tracker",
            requestedDepth: 100,
          },
          {
            checkedAt: new Date("2026-07-19T10:00:00.000Z"),
            id: "check_1",
            normalizationVersion: "v1",
            position: 5,
            previousPosition: 8,
            provider: "serpapi",
            publicId: CHECK_PUBLIC_ID,
            rankingUrl: null,
            requestedDepth: 100,
          },
        ],
        tags: [],
        text: "rank tracker",
      },
    ]);
  });

  it("authorizes an explicit actor, applies filters, and audits the export", async () => {
    const loaded = await loadRankHistoryExport({
      actor,
      auditActorId: null,
      format: "json",
      granularity: "daily",
      keywordIds: [KEYWORD_PUBLIC_ID],
      projectId: PROJECT_PUBLIC_ID,
      range: "90",
    });
    expect(loaded.project.publicId).toBe(PROJECT_PUBLIC_ID);
    expect(mocks.prisma.keyword.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 1001,
        where: expect.objectContaining({ publicId: { in: [KEYWORD_PUBLIC_ID] } }),
      }),
    );
    expect(mocks.prisma.rankCheck.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 500,
        orderBy: [{ createdAt: "asc" }, { publicId: "asc" }],
        select: expect.objectContaining({
          checkedAt: true,
          previousPosition: true,
          rankingUrl: true,
        }),
      }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "keyword.json_export", actorId: null }),
    );
  });

  it("preserves resolved membership order for history exports", async () => {
    const secondId = "kw_bbcdefghijklmnopqrstuvwx";
    const rows = [
      {
        id: "keyword_1",
        createdAt: new Date(),
        publicId: KEYWORD_PUBLIC_ID,
        rankChecks: [],
        tags: [],
        text: "first",
      },
      {
        id: "keyword_2",
        createdAt: new Date(),
        publicId: secondId,
        rankChecks: [],
        tags: [],
        text: "second",
      },
    ];
    mocks.prisma.keyword.findMany.mockResolvedValueOnce(rows);
    const loaded = await loadRankHistoryExport({
      actor,
      format: "csv",
      granularity: "daily",
      keywordIds: [secondId, KEYWORD_PUBLIC_ID],
      projectId: PROJECT_PUBLIC_ID,
      range: "all",
    });
    expect(loaded.keywords.map((keyword) => keyword.publicId)).toEqual([
      secondId,
      KEYWORD_PUBLIC_ID,
    ]);
  });

  it("supports daily and weekly rows plus CSV escaping", async () => {
    const loaded = await loadRankHistoryExport({
      actor,
      format: "csv",
      granularity: "daily",
      projectId: PROJECT_PUBLIC_ID,
      range: "all",
    });
    expect(rankHistoryRows(loaded, "daily")).toHaveLength(2);
    const weekly = rankHistoryRows(loaded, "weekly");
    expect(weekly).toHaveLength(1);
    expect(rankHistoryCsvHeader).toBe(
      "keyword_id,keyword,checked_at,position,previous_position,ranking_url,provider,requested_depth,normalization_version",
    );
    expect(rankHistoryCsvLine(weekly[0])).toContain('"https://example.com/rank,tracker"');
    expect(rankHistoryCsvLine(weekly[0])).toContain(",dataforseo,100,v1");
  });

  it("rejects an actor without project membership", async () => {
    await expect(
      loadRankHistoryExport({
        actor: { id: "outsider", memberships: [] },
        format: "json",
        granularity: "daily",
        projectId: PROJECT_PUBLIC_ID,
        range: "all",
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(mocks.prisma.keyword.findMany).not.toHaveBeenCalled();
  });

  it("rejects legacy and wrong-prefix keyword filters before querying", async () => {
    await expect(
      loadRankHistoryExport({
        actor,
        format: "json",
        granularity: "daily",
        keywordIds: ["keyword_1", CHECK_PUBLIC_ID],
        projectId: PROJECT_PUBLIC_ID,
        range: "all",
      }),
    ).rejects.toThrow("Keyword not found.");
    expect(mocks.prisma.project.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.keyword.findMany).not.toHaveBeenCalled();
  });
});

describe("rank-history CSV format safety", () => {
  beforeEach(() => {
    vi.setSystemTime(reportAsOf);
    configureHistoryExportDatabase(mocks.prisma);
    const keyword = historicKeywordFixture();
    mocks.prisma.project.findFirst.mockResolvedValue({
      id: "project_1",
      publicId: PROJECT_PUBLIC_ID,
    });
    mocks.prisma.keyword.findMany.mockResolvedValue([
      {
        ...keyword,
        id: "keyword_1",
        rankChecks: keyword.rankChecks.map((check, index) => ({
          ...check,
          publicId: index === 0 ? CHECK_PUBLIC_ID_2 : CHECK_PUBLIC_ID,
        })),
      },
    ]);
    mocks.writeAuditFailure.mockResolvedValue(undefined);
  });
  it("neutralizes text with leading controls/BOM and preserves per-check URLs and numbers", async () => {
    const loaded = await loadRankHistoryExport({
      actor,
      format: "csv",
      granularity: "daily",
      projectId: PROJECT_PUBLIC_ID,
      range: "all",
    });
    const keyword = loaded.keywords[0];
    keyword.text = "\uFEFF=1+1";
    keyword.rankChecks[0].rankingUrl = 'https://example.com/b?q="a,b"';
    keyword.rankChecks[1].rankingUrl = "https://example.com/a";
    keyword.rankChecks[0].previousPosition = -3;
    keyword.rankChecks[0].provider = "  +provider";
    keyword.rankChecks[0].normalizationVersion = "@version";
    const before = structuredClone(loaded);
    const rows = rankHistoryRows(loaded, "daily");
    expect(rankHistoryCsvLine(rows[0])).toBe(
      `${KEYWORD_PUBLIC_ID},'\uFEFF=1+1,2026-10-08T15:00:00.000Z,3,-3,"https://example.com/b?q=""a,b""",'  +provider,100,'@version`,
    );
    expect(rankHistoryCsvLine(rows[1])).toContain(",5,2,https://example.com/a,");
    expect(rows[0].keyword).toBe(keyword.text);
    expect(loaded).toEqual(before);
  });

  it("keeps null URLs/positions empty in CSV and null in the raw rows", async () => {
    const loaded = await loadRankHistoryExport({
      actor,
      format: "csv",
      granularity: "daily",
      projectId: PROJECT_PUBLIC_ID,
      range: "all",
    });
    loaded.keywords[0].rankChecks[0].rankingUrl = null;
    loaded.keywords[0].rankChecks[0].position = null;
    const rows = rankHistoryRows(loaded, "daily");
    expect(rows[0]).toMatchObject({ rankingUrl: null, position: null });
    expect(rankHistoryCsvLine(rows[0])).toContain(",,5,,serpapi,");
  });

  it("preserves v1 raw daily observations and the Jan1 UTC weekly bucket across year boundary", async () => {
    const loaded = await loadRankHistoryExport({
      actor,
      format: "csv",
      granularity: "daily",
      projectId: PROJECT_PUBLIC_ID,
      range: "all",
    });
    const check = loaded.keywords[0].rankChecks[0];
    loaded.keywords[0].rankChecks = [
      { ...check, checkedAt: new Date("2026-01-01T15:00:00.000Z") },
      { ...check, checkedAt: new Date("2026-01-01T09:00:00.000Z"), publicId: CHECK_PUBLIC_ID },
      {
        ...check,
        checkedAt: new Date("2025-12-31T23:00:00.000Z"),
        publicId: "check_cbcdefghijklmnopqrstuvwx",
      },
    ];
    expect(rankHistoryRows(loaded, "daily")).toHaveLength(3);
    expect(rankHistoryRows(loaded, "weekly").map((row) => row.checkedAt.toISOString())).toEqual([
      "2026-01-01T15:00:00.000Z",
      "2025-12-31T23:00:00.000Z",
    ]);
  });
});
