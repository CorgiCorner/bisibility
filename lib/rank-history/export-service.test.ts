import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadRankHistoryExport,
  rankHistoryCsvHeader,
  rankHistoryCsvLine,
  rankHistoryRows,
} from "./export-service";

const mocks = vi.hoisted(() => ({
  prisma: {
    keyword: { findMany: vi.fn() },
    project: { findFirst: vi.fn() },
  },
  writeAudit: vi.fn(),
  writeAuditFailure: vi.fn(),
}));

vi.mock("server-only", () => ({}));
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
        select: expect.objectContaining({
          publicId: true,
          rankChecks: expect.objectContaining({
            orderBy: [{ checkedAt: "desc" }, { publicId: "desc" }],
            select: {
              checkedAt: true,
              normalizationVersion: true,
              position: true,
              previousPosition: true,
              provider: true,
              publicId: true,
              rankingUrl: true,
              requestedDepth: true,
            },
            where: expect.objectContaining({ status: "completed" }),
          }),
        }),
        where: expect.objectContaining({
          publicId: { in: [KEYWORD_PUBLIC_ID] },
        }),
      }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "keyword.json_export", actorId: null }),
    );
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
    ).rejects.toThrow("not authorized");
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
