import {
  CloudImportTokenError,
  cloudImportBodySchema,
  importCloudExport,
} from "@/lib/api/cloud-import";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/api/keyword-create", () => ({ createKeywords: mocks.createKeywords }));
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
const url = new URL("https://example.com/api/v1/cloud/import");
const ids = {
  destinationProject: "prj_abcdefghijklmnopqrstuvwx",
  firstKeyword: "kw_abcdefghijklmnopqrstuvwx",
  secondKeyword: "kw_bbcdefghijklmnopqrstuvwx",
  sourceProject: "prj_bbcdefghijklmnopqrstuvwx",
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

function importBody(input: unknown) {
  return cloudImportBodySchema.parse({
    alert_rules: [],
    competitors: [],
    keywords: [],
    notification_preferences: [],
    project_id: ids.sourceProject,
    saved_views: [],
    version: 6,
    ...(input as Record<string, unknown>),
  });
}

function keyword(text: string, sourceId: string) {
  return {
    device: "desktop",
    id: sourceId,
    keyword: text,
    location: "United States",
    rankingHistory: [
      {
        checkedAt: "2026-06-20T10:00:00.000Z",
        normalizationVersion: "v1",
        position: 3,
        previousPosition: 7,
        provider: "dataforseo",
        rankingUrl: `https://example.com/${sourceId}`,
        requestedDepth: 100,
      },
    ],
    tags: ["SEO"],
    target_url: `/${sourceId}`,
  };
}

function audit(action: string) {
  return mocks.writeAudit.mock.calls.find(([input]) => input.action === action)?.[0];
}

describe("importCloudExport hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-28T12:00:00.000Z"));
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
    mocks.prisma.tag.findMany.mockResolvedValue([]);
    mocks.prisma.alertRule.findFirst.mockResolvedValue(null);
    mocks.prisma.alertRule.create.mockResolvedValue({ id: "rule_1" });
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
    mocks.writeAudit.mockResolvedValue({ id: "audit_1" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("throws a token error when a concurrent consume wins the race", async () => {
    mocks.prisma.migrationToken.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      importCloudExport(
        token,
        importBody({ keywords: [keyword("rank tracker", ids.firstKeyword)] }),
        url,
      ),
    ).rejects.toBeInstanceOf(CloudImportTokenError);
    expect(
      mocks.prisma.cloudImportJob.update.mock.calls.map(([input]) => input.data.state),
    ).not.toContain("done");
  });

  it("keeps an atomic import open beyond Prisma's five-second default", async () => {
    mocks.createKeywords.mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 6_000));
      return Response.json({ created: 1, skipped: 0 });
    });
    mocks.prisma.$transaction.mockImplementation(async (callback, options) => {
      const startedAt = Date.now();
      const result = await callback(mocks.prisma);
      const timeout = options?.timeout ?? 5_000;
      if (Date.now() - startedAt > timeout) {
        throw new Error(`Transaction expired after ${timeout} ms.`);
      }
      return result;
    });

    const pending = importCloudExport(
      token,
      importBody({ keywords: [keyword("rank tracker", ids.firstKeyword)] }),
      url,
    );
    await vi.advanceTimersByTimeAsync(6_000);

    await expect(pending).resolves.toMatchObject({
      counts: { history: 1, keywords_created: 1 },
    });
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 120_000,
    });
    expect(mocks.prisma.migrationToken.updateMany).toHaveBeenCalledOnce();
  });

  it("applies only the creator notification preference and counts skipped entries", async () => {
    const result = await importCloudExport(
      token,
      importBody({
        keywords: [],
        notification_preferences: [
          { alert_email: false, check_email: true },
          { alert_email: true, check_email: false },
          { invite_in_app: false },
        ],
      }),
      url,
    );

    expect(result.counts).toMatchObject({
      notification_preferences: 1,
      notification_preferences_skipped: 2,
    });
    expect(mocks.prisma.notificationPreference.upsert).toHaveBeenCalledOnce();
    expect(mocks.prisma.notificationPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          alertEmail: false,
          checkEmail: true,
          projectId: "project_1",
          userId: "user_1",
        }),
      }),
    );
    expect(audit("migration_token.consume")).toMatchObject({
      action: "migration_token.consume",
      actorId: "user_1",
      targetId: "ferry_abcdefghijklmnopqrstuvwx",
      targetType: "migration_token",
    });
  });

  it("drops history rows whose destination keyword cannot be resolved", async () => {
    const result = await importCloudExport(
      token,
      importBody({
        keywords: [
          keyword("rank tracker", ids.firstKeyword),
          keyword("missing keyword", ids.secondKeyword),
        ],
      }),
      url,
    );

    expect(result.counts).toMatchObject({ history: 1, history_received: 2 });
    expect(mocks.prisma.rankCheck.createMany).toHaveBeenCalledWith({
      skipDuplicates: true,
      data: [
        {
          attemptCount: 1,
          checkedAt: new Date("2026-06-20T10:00:00.000Z"),
          degradedToCountry: false,
          keywordId: "keyword_1",
          normalizationVersion: "v1",
          position: 3,
          previousPosition: 7,
          provider: "dataforseo",
          publicId: expect.stringMatching(/^check_[a-z][a-z0-9]{23}$/),
          rankingUrl: `https://example.com/${ids.firstKeyword}`,
          requestedDepth: 100,
          status: "completed",
          viaFallback: false,
        },
      ],
    });
  });
});
