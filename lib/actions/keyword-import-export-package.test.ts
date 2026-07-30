import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportCloudImportPackage, exportKeywords } from "./keyword-import-export";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  cookies: vi.fn(),
  prisma: {
    alertRule: { findMany: vi.fn() },
    competitor: { findMany: vi.fn() },
    keyword: { findMany: vi.fn() },
    notificationPreference: { findUnique: vi.fn() },
    project: { findFirst: vi.fn(), findUnique: vi.fn() },
    savedView: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  requireSession: vi.fn(),
  revalidatePath: vi.fn(),
  requiredPublicAuditId: vi.fn((id: string) => id),
  writeAudit: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/auth/authorize", () => ({ authorize: mocks.authorize }));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: mocks.requiredPublicAuditId,
  writeAudit: mocks.writeAudit,
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const ids = {
  competitor: "cmp_abcdefghijklmnopqrstuvwx",
  keyword: "kw_abcdefghijklmnopqrstuvwx",
  project: "prj_abcdefghijklmnopqrstuvwx",
  rule: "alr_abcdefghijklmnopqrstuvwx",
  view: "viw_abcdefghijklmnopqrstuvwx",
};

function keyword(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    device: "desktop",
    id: "keyword_1",
    location: "United States",
    publicId: ids.keyword,
    rankChecks: [
      {
        checkedAt: new Date("2026-06-20T10:00:00.000Z"),
        costCents: null,
        id: "check_1",
        position: 3,
        previousPosition: 7,
        provider: "self-hosted",
        rankingUrl: "https://example.com/rank-tracker",
      },
    ],
    tags: [{ tag: { name: "SEO" } }, { tag: { name: "Product" } }],
    targetUrl: "/rank",
    text: "rank tracker",
    updatedAt: new Date("2026-06-21T00:00:00.000Z"),
    ...overrides,
  };
}

describe("keyword export packages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-28T12:00:00.000Z"));
    mocks.cookies.mockResolvedValue({ get: vi.fn() });
    mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.prisma.user.findUnique.mockResolvedValue({
      memberships: [{ projectId: "project_1", role: "admin" }],
      role: "member",
    });
    mocks.prisma.project.findFirst.mockResolvedValue({
      id: "project_1",
      ownerId: "user_1",
      publicId: ids.project,
    });
    mocks.prisma.project.findUnique.mockResolvedValue({
      domain: "example.com",
      name: "Example",
      publicId: ids.project,
    });
    mocks.prisma.keyword.findMany.mockResolvedValue([keyword()]);
    mocks.prisma.alertRule.findMany.mockResolvedValue([
      {
        changePct: null,
        channels: ["email"],
        competitorDomain: null,
        conditionType: "threshold",
        dropPositions: null,
        enabled: true,
        publicId: ids.rule,
        name: "Top ten",
        serpFeature: null,
        targetType: "keyword",
        targets: [
          {
            keyword: {
              device: "desktop",
              location: "United States",
              publicId: ids.keyword,
              text: "rank tracker",
            },
            tag: null,
          },
        ],
        thresholdPosition: 10,
        topN: null,
      },
    ]);
    mocks.prisma.competitor.findMany.mockResolvedValue([
      {
        domain: "competitor.example.com",
        label: "Competitor",
        publicId: ids.competitor,
      },
    ]);
    mocks.prisma.notificationPreference.findUnique.mockResolvedValue({
      alertEmail: true,
      alertInApp: true,
      checkEmail: true,
      checkInApp: true,
      importEmail: true,
      importInApp: true,
      inviteEmail: true,
      inviteInApp: true,
      reportEmail: false,
    });
    mocks.prisma.savedView.findMany.mockResolvedValue([
      { config: { search: "rank" }, name: "Rank", publicId: ids.view, surface: "keywords" },
    ]);
    mocks.writeAudit.mockResolvedValue({ id: "audit_export_1" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("exports the complete strict version 4 cloud import package", async () => {
    const result = await exportCloudImportPackage({ projectId: ids.project });
    const payload = JSON.parse(result.content);

    expect(result).toMatchObject({
      counts: {
        alertRules: 1,
        competitors: 1,
        keywords: 1,
        notificationPreferences: 1,
        rankChecks: 1,
        savedViews: 1,
      },
      filename: `bisibility-cloud-import-${ids.project}.json`,
      mimeType: "application/json",
    });
    expect(mocks.prisma.keyword.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          rankChecks: {
            orderBy: { checkedAt: "desc" },
            where: { status: { not: "deferred" } },
          },
          tags: { include: { tag: true } },
        },
        where: { projectId: "project_1" },
      }),
    );
    expect(payload).toMatchObject({
      exported_at: "2026-06-28T12:00:00.000Z",
      project_id: ids.project,
      scope: "history",
      version: 5,
    });
    expect(payload.keywords).toEqual([
      expect.objectContaining({
        device: "desktop",
        id: ids.keyword,
        keyword: "rank tracker",
        location: "United States",
        tags: ["SEO", "Product"],
        target_url: "/rank",
      }),
    ]);
    expect(payload.rank_checks).toBeUndefined();
    expect(payload.keywords[0].rankingHistory).toEqual([
      {
        checkedAt: "2026-06-20T10:00:00.000Z",
        position: 3,
        previousPosition: 7,
        rankingUrl: "https://example.com/rank-tracker",
      },
    ]);
    expect(payload.alert_rules).toEqual([
      expect.objectContaining({
        condition_type: "threshold",
        id: ids.rule,
        targets: [expect.objectContaining({ keyword_id: ids.keyword, type: "keyword" })],
      }),
    ]);
    expect(payload.competitors).toEqual([
      { domain: "competitor.example.com", id: ids.competitor, label: "Competitor" },
    ]);
    expect(payload.notification_preferences).toEqual([
      expect.objectContaining({ check_email: true, report_email: false }),
    ]);
    expect(payload.saved_views).toEqual([
      { config: { search: "rank" }, id: ids.view, name: "Rank", surface: "keywords" },
    ]);
    expect(mocks.writeAudit).toHaveBeenCalledWith({
      action: "cloud_import.export_package",
      actorId: "user_1",
      after: { count: 1 },
      projectId: "project_1",
      targetId: ids.project,
      targetType: "project",
    });
    expect(mocks.writeAudit).not.toHaveBeenCalledWith(
      expect.objectContaining({ targetId: "project_1" }),
    );
  });

  it.each(["project_1", ` ${ids.project}`, ids.project.toUpperCase()])(
    "rejects a non-exact project public ID before export: %s",
    async (projectId) => {
      await expect(exportCloudImportPackage({ projectId })).rejects.toThrow(
        "Expected a strict prj_ v3 public ID.",
      );
      expect(mocks.prisma.keyword.findMany).not.toHaveBeenCalled();
    },
  );

  it("rejects raw IDs in regular keyword exports before lookup", async () => {
    await expect(
      exportKeywords({
        columns: {},
        format: "json",
        projectId: "project_1",
        scope: "current",
      }),
    ).rejects.toThrow("Expected a strict prj_ v3 public ID.");
    await expect(
      exportKeywords({
        columns: {},
        format: "json",
        keywordIds: ["keyword_1"],
        projectId: ids.project,
        scope: "current",
      }),
    ).rejects.toThrow("Keyword not found.");
    expect(mocks.prisma.keyword.findMany).not.toHaveBeenCalled();
  });

  it("audits keyword export downloads", async () => {
    const result = await exportKeywords({
      columns: { country: true, device: true, tags: true, url: true },
      format: "csv",
      projectId: ids.project,
      scope: "current",
    });

    expect(result.filename).toBe(`bisibility-keywords-${ids.project}-current.csv`);
    expect(mocks.writeAudit).toHaveBeenCalledWith({
      action: "keyword.csv_export",
      actorId: "user_1",
      after: { count: 1, format: "csv", scope: "current" },
      projectId: "project_1",
      targetId: ids.project,
      targetType: "project",
    });
  });

  it("exports an explicitly empty keyword selection as JSON", async () => {
    const result = await exportKeywords({
      format: "json",
      keywordIds: [],
      projectId: ids.project,
      scope: "current",
    });
    expect(JSON.parse(result.content)).toMatchObject({ keywords: [] });
    expect(mocks.prisma.keyword.findMany).not.toHaveBeenCalled();
  });

  it("fails clearly when the package would exceed the import limit", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue(
      Array.from({ length: 501 }, (_, index) => keyword({ id: `keyword_${index}` })),
    );

    await expect(exportCloudImportPackage({ projectId: ids.project })).rejects.toThrow(
      "up to 500 keywords",
    );
  });

  it("fails clearly when a keyword has too much rank history for one package", async () => {
    const rankChecks = Array.from({ length: 5001 }, (_, index) => ({
      checkedAt: new Date("2026-06-20T10:00:00.000Z"),
      costCents: null,
      id: `check_${index}`,
      position: 3,
      previousPosition: 7,
      provider: "self-hosted",
      rankingUrl: null,
    }));
    mocks.prisma.keyword.findMany.mockResolvedValue([keyword({ rankChecks })]);

    await expect(exportCloudImportPackage({ projectId: ids.project })).rejects.toThrow(
      "up to 5000 checks",
    );
  });
});
