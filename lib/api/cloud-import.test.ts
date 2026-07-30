import { beforeEach, describe, expect, it, vi } from "vitest";
import { cloudImportBodySchema, importCloudExport } from "./cloud-import";
import { CLOUD_IMPORT_FAILURE_DETAIL } from "./instance-import/failure";

const mocks = vi.hoisted(() => ({
  createKeywords: vi.fn(),
  notifyCloudImportDone: vi.fn(() => Promise.resolve()),
  notifyCloudImportFailed: vi.fn(() => Promise.resolve()),
  prisma: {
    $transaction: vi.fn(),
    alertRule: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    alertRuleTarget: { createMany: vi.fn(), deleteMany: vi.fn() },
    cloudImportJob: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    competitor: { findMany: vi.fn(), upsert: vi.fn() },
    keyword: { findMany: vi.fn() },
    migrationToken: { updateMany: vi.fn() },
    notificationPreference: { findUnique: vi.fn(), upsert: vi.fn() },
    project: { findUnique: vi.fn() },
    rankCheck: { createMany: vi.fn(), findMany: vi.fn() },
    savedView: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    tag: { findMany: vi.fn() },
  },
  writeAudit: vi.fn(() => Promise.resolve({ id: "audit_1" })),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./keyword-create", () => ({ createKeywords: mocks.createKeywords }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/notifications/events", () => ({
  notifyCloudImportDone: mocks.notifyCloudImportDone,
  notifyCloudImportFailed: mocks.notifyCloudImportFailed,
}));

const token = {
  createdById: "user_1",
  id: "token_1",
  projectId: "project_1",
  projectPublicId: "prj_abcdefghijklmnopqrstuvwx",
  publicId: "ferry_abcdefghijklmnopqrstuvwx",
  singleUse: true,
};
const url = new URL("https://example.com/api/cloud/import");
const ids = {
  destinationProject: "prj_abcdefghijklmnopqrstuvwx",
  keyword: "kw_abcdefghijklmnopqrstuvwx",
  ruleKeyword: "alr_abcdefghijklmnopqrstuvwx",
  ruleTag: "alr_bbcdefghijklmnopqrstuvwx",
  sourceProject: "prj_bbcdefghijklmnopqrstuvwx",
  view: "viw_abcdefghijklmnopqrstuvwx",
};

function project(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    domain: "example.com",
    id: "project_1",
    name: "Example",
    ownerId: "owner_1",
    publicId: ids.destinationProject,
    updatedAt: new Date("2026-06-02T00:00:00.000Z"),
    writeMode: "active",
    ...overrides,
  };
}

function job(overrides: Record<string, unknown> = {}) {
  return {
    counts: null,
    createdAt: new Date("2026-06-28T12:00:00.000Z"),
    error: null,
    finishedAt: null,
    id: "job_1",
    publicId: "imp_abcdefghijklmnopqrstuvwx",
    progress: 1,
    projectId: "project_1",
    startedAt: new Date("2026-06-28T12:00:00.000Z"),
    state: "receiving",
    tokenId: "token_1",
    ...overrides,
  };
}

function importBody(overrides: Record<string, unknown> = {}) {
  return cloudImportBodySchema.parse({
    alert_rules: [],
    competitors: [],
    keywords: [],
    notification_preferences: [],
    project_id: ids.sourceProject,
    saved_views: [],
    version: 5,
    ...overrides,
  });
}

function fullPayload() {
  return importBody({
    alert_rules: [
      {
        channels: ["email"],
        condition_type: "threshold",
        id: ids.ruleKeyword,
        name: "Top 3 drop",
        target_type: "keyword",
        targets: [{ keyword_id: ids.keyword, type: "keyword" }],
        threshold_position: 3,
      },
      {
        channels: ["webhook"],
        condition_type: "serp_feature",
        id: ids.ruleTag,
        name: "Featured snippet",
        serp_feature: "featured",
        target_type: "tag",
        targets: [{ tag: "SEO", type: "tag" }],
      },
    ],
    competitors: [
      {
        domain: "competitor.example.com",
        id: "cmp_abcdefghijklmnopqrstuvwx",
        label: "Rankzly",
      },
    ],
    keywords: [
      {
        device: "desktop",
        id: ids.keyword,
        keyword: "rank tracker",
        location: "United States",
        rankingHistory: [
          {
            checkedAt: "2026-06-20T10:00:00.000Z",
            position: 3,
            previousPosition: 7,
            rankingUrl: "https://example.com/rank-tracker",
          },
        ],
        tags: ["SEO"],
        target_url: "/rank",
      },
    ],
    notification_preferences: [{ alert_email: false, check_email: true, invite_in_app: false }],
    saved_views: [{ config: { search: "rank" }, id: ids.view, name: "Rank terms" }],
  });
}

describe("cloud import package restoration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
    mocks.prisma.project.findUnique.mockResolvedValue(project());
    mocks.prisma.cloudImportJob.findFirst.mockResolvedValue(job());
    mocks.prisma.cloudImportJob.update.mockImplementation(({ data, where }) =>
      Promise.resolve(job({ ...data, id: where.id })),
    );
    mocks.prisma.cloudImportJob.create.mockImplementation(({ data }) =>
      Promise.resolve(job({ ...data, id: "job_created" })),
    );
    mocks.createKeywords.mockResolvedValue(Response.json({ created: 1, skipped: 0 }));
    mocks.prisma.keyword.findMany.mockResolvedValue([
      { device: "desktop", id: "keyword_1", location: "United States", text: "rank tracker" },
    ]);
    mocks.prisma.rankCheck.createMany.mockResolvedValue({ count: 1 });
    mocks.prisma.rankCheck.findMany.mockResolvedValue([]);
    mocks.prisma.tag.findMany.mockResolvedValue([{ id: "tag_1", name: "SEO" }]);
    mocks.prisma.alertRule.findFirst.mockResolvedValue(null);
    mocks.prisma.alertRule.create
      .mockResolvedValueOnce({ id: "rule_keyword" })
      .mockResolvedValueOnce({ id: "rule_tag" });
    mocks.prisma.alertRule.update.mockImplementation(({ where }) =>
      Promise.resolve({ id: where.id }),
    );
    mocks.prisma.alertRuleTarget.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.alertRuleTarget.createMany.mockResolvedValue({ count: 1 });
    mocks.prisma.competitor.findMany.mockResolvedValue([]);
    mocks.prisma.competitor.upsert.mockImplementation(({ create }) => Promise.resolve(create));
    mocks.prisma.savedView.findFirst.mockResolvedValue(null);
    mocks.prisma.savedView.create.mockImplementation(({ data }) =>
      Promise.resolve({ ...data, id: "view_1" }),
    );
    mocks.prisma.savedView.update.mockImplementation(({ data, where }) =>
      Promise.resolve({ ...data, id: where.id }),
    );
    mocks.prisma.notificationPreference.findUnique.mockResolvedValue(null);
    mocks.prisma.notificationPreference.upsert.mockImplementation(({ create }) =>
      Promise.resolve(create),
    );
    mocks.prisma.migrationToken.updateMany.mockResolvedValue({ count: 1 });
  });

  it("restores strict version 4 package sections with local target ids", async () => {
    const result = await importCloudExport(token, fullPayload(), url);

    expect(result.counts).toMatchObject({
      alert_rules: 2,
      alert_rules_skipped: 0,
      competitors: 1,
      history: 1,
      keywords: 1,
      notification_preferences: 1,
      notification_preferences_skipped: 0,
      saved_views: 1,
    });
    const [ctx] = mocks.createKeywords.mock.calls[0];
    await expect(ctx.req.json()).resolves.toEqual([
      {
        device: "desktop",
        keyword: "rank tracker",
        location: "United States",
        tags: ["SEO"],
        target_url: "/rank",
      },
    ]);
    expect(mocks.prisma.competitor.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId_domain: { domain: "competitor.example.com", projectId: "project_1" },
        },
      }),
    );
    expect(mocks.prisma.alertRuleTarget.createMany).toHaveBeenCalledWith({
      data: [{ keywordId: "keyword_1", ruleId: "rule_keyword" }],
    });
    expect(mocks.prisma.alertRuleTarget.createMany).toHaveBeenCalledWith({
      data: [{ ruleId: "rule_tag", tagId: "tag_1" }],
    });
    expect(mocks.prisma.notificationPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          alertEmail: false,
          projectId: "project_1",
          userId: "user_1",
        }),
        where: { userId_projectId: { projectId: "project_1", userId: "user_1" } },
      }),
    );
    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
    expect(mocks.prisma.migrationToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { consumedAt: expect.any(Date) },
        where: expect.objectContaining({ consumedAt: null, id: "token_1" }),
      }),
    );
  });

  it("marks the job failed and leaves the token reusable when an import write fails", async () => {
    const internalError =
      "Invalid prisma.rankCheck.createMany() invocation: expired transaction; SELECT secret";
    mocks.prisma.rankCheck.createMany.mockRejectedValueOnce(new Error(internalError));

    await expect(importCloudExport(token, fullPayload(), url)).rejects.toThrow(internalError);

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.migrationToken.updateMany).not.toHaveBeenCalled();
    expect(
      mocks.prisma.cloudImportJob.update.mock.calls.map(([input]) => input.data.state),
    ).toContain("failed");
    expect(
      mocks.prisma.cloudImportJob.update.mock.calls.map(([input]) => input.data.error),
    ).toContain(CLOUD_IMPORT_FAILURE_DETAIL);
    expect(mocks.notifyCloudImportFailed).toHaveBeenCalledWith({
      error: CLOUD_IMPORT_FAILURE_DETAIL,
      jobId: "job_1",
      projectId: "project_1",
    });
    expect(JSON.stringify(mocks.notifyCloudImportFailed.mock.calls)).not.toContain("prisma");
    expect(JSON.stringify(mocks.notifyCloudImportFailed.mock.calls)).not.toContain("SELECT");
  });

  it("applies the first notification preference and counts the rest as skipped", async () => {
    const body = importBody({
      keywords: [
        {
          device: "desktop",
          id: ids.keyword,
          keyword: "rank tracker",
          location: "United States",
          rankingHistory: [],
          tags: [],
        },
      ],
      notification_preferences: [
        { alert_email: false },
        { alert_email: true },
        { check_email: true },
      ],
    });

    const result = await importCloudExport(token, body, url);

    expect(result.counts).toMatchObject({
      notification_preferences: 1,
      notification_preferences_skipped: 2,
    });
    expect(mocks.prisma.notificationPreference.upsert).toHaveBeenCalledOnce();
    expect(mocks.prisma.notificationPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ alertEmail: false, userId: "user_1" }),
      }),
    );
  });

  it("updates existing saved views and alert rules instead of duplicating them", async () => {
    mocks.prisma.alertRule.findFirst.mockResolvedValue({
      channels: [],
      enabled: true,
      id: "rule_existing",
      targets: [],
    });
    mocks.prisma.savedView.findFirst.mockResolvedValue({ id: "view_existing" });

    const result = await importCloudExport(token, fullPayload(), url);

    expect(result.counts).toMatchObject({ alert_rules: 2 });
    expect(mocks.prisma.alertRule.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "rule_existing" } }),
    );
    expect(mocks.prisma.alertRuleTarget.deleteMany).toHaveBeenCalledWith({
      where: { ruleId: "rule_existing" },
    });
    expect(mocks.prisma.savedView.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "view_existing" } }),
    );
    expect(mocks.prisma.savedView.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: "Rank terms", projectId: "project_1", surface: "keywords" },
      }),
    );
  });

  it("imports a strict version 4 package with empty non-keyword sections", async () => {
    const body = importBody({
      keywords: [
        {
          device: "desktop",
          id: ids.keyword,
          keyword: "rank tracker",
          location: "United States",
          rankingHistory: [],
          tags: [],
        },
      ],
      scope: "history",
    });

    const result = await importCloudExport(token, body, url);

    expect(result.counts).toEqual({
      alert_rules: 0,
      alert_rules_skipped: 0,
      competitors: 0,
      competitors_skipped: 0,
      history: 0,
      history_received: 0,
      history_skipped: 0,
      keywords: 1,
      keywords_created: 1,
      keywords_skipped: 0,
      notification_preferences: 0,
      notification_preferences_skipped: 0,
      saved_views: 0,
      saved_views_skipped: 0,
    });
    expect(mocks.prisma.competitor.upsert).not.toHaveBeenCalled();
    expect(mocks.prisma.alertRule.create).not.toHaveBeenCalled();
  });

  it("skips history rows that already exist when the same package is re-imported", async () => {
    mocks.prisma.rankCheck.findMany.mockResolvedValue([
      { checkedAt: new Date("2026-06-20T10:00:00.000Z"), keywordId: "keyword_1" },
    ]);

    const result = await importCloudExport(token, fullPayload(), url);

    expect(result.counts).toMatchObject({
      history: 0,
      history_received: 1,
      history_skipped: 1,
    });
    expect(mocks.prisma.rankCheck.createMany).not.toHaveBeenCalled();
  });

  it("rejects a package exported from the destination project itself", async () => {
    const body = importBody({
      keywords: [
        {
          device: "desktop",
          id: ids.keyword,
          keyword: "rank tracker",
          location: "United States",
          rankingHistory: [],
          tags: [],
        },
      ],
      project_id: ids.destinationProject,
    });

    await expect(importCloudExport(token, body, url)).rejects.toMatchObject({
      code: "self_import",
      status: 409,
    });
    expect(mocks.prisma.cloudImportJob.findFirst).not.toHaveBeenCalled();
    expect(mocks.createKeywords).not.toHaveBeenCalled();
  });

  it("rejects read-only projects before opening an import job", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue(project({ writeMode: "migrated" }));

    await expect(importCloudExport(token, fullPayload(), url)).rejects.toMatchObject({
      code: "project_read_only",
    });
    expect(mocks.prisma.cloudImportJob.findFirst).not.toHaveBeenCalled();
    expect(mocks.createKeywords).not.toHaveBeenCalled();
  });
});
