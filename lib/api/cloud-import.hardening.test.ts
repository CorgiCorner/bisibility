import { POST } from "@/app/api/v1/cloud/import/route";
import {
  CloudImportTokenError,
  cloudImportBodySchema,
  importCloudExport,
} from "@/lib/api/cloud-import";
import { ImportSessionBodyError, readJsonBody } from "@/lib/api/instance-import/session-http";
import type { NextRequest } from "next/server";
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
  checkRateLimit: vi.fn(),
  rateLimitExceeded: vi.fn(),
  verifyMigrationToken: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/api/instance-import/token-verifier", () => ({
  verifyMigrationTokenInternal: mocks.verifyMigrationToken,
}));
vi.mock("@/lib/api/ratelimit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  rateLimitExceeded: mocks.rateLimitExceeded,
}));
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
      {
        device: "desktop",
        id: "keyword_1",
        locationRef: { canonicalKey: "US" },
        text: "rank tracker",
      },
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

  it("fails rather than attaching history when a destination keyword has no exact location identity", async () => {
    await expect(
      importCloudExport(
        token,
        importBody({
          keywords: [
            keyword("rank tracker", ids.firstKeyword),
            keyword("missing keyword", ids.secondKeyword),
          ],
        }),
        url,
      ),
    ).rejects.toThrow("Imported location key US could not be resolved exactly.");

    expect(mocks.prisma.rankCheck.createMany).not.toHaveBeenCalled();
    expect(mocks.prisma.migrationToken.updateMany).not.toHaveBeenCalled();
  });
});

describe("cloud import body limits", () => {
  const previousLimit = process.env.BISIBILITY_MIGRATION_IMPORT_MAX_BODY_BYTES;

  function countedStream(chunkCount: number, counter: { pulled: number }) {
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        if (counter.pulled >= chunkCount) {
          controller.close();
          return;
        }
        counter.pulled += 1;
        controller.enqueue(new Uint8Array(1024));
      },
    });
  }

  function streamedRequest(chunkCount: number, counter: { pulled: number }) {
    return new Request(url, {
      body: countedStream(chunkCount, counter),
      // @ts-expect-error - duplex is required by undici for a streaming body.
      duplex: "half",
      headers: { authorization: "Bearer mig_valid_token_value_12345" },
      method: "POST",
    });
  }

  function unreadableRequest() {
    const body = new ReadableStream<Uint8Array>({
      pull() {
        throw new Error("Stream read failed.");
      },
    });
    return new Request(url, {
      body,
      // @ts-expect-error - duplex is required by undici for a streaming body.
      duplex: "half",
      headers: { authorization: "Bearer mig_valid_token_value_12345" },
      method: "POST",
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BISIBILITY_MIGRATION_IMPORT_MAX_BODY_BYTES = "4096";
    mocks.checkRateLimit.mockResolvedValue({ headers: new Headers(), success: true });
    mocks.rateLimitExceeded.mockImplementation(() =>
      Response.json({ status: 429 }, { status: 429 }),
    );
  });

  afterEach(() => {
    if (previousLimit === undefined) delete process.env.BISIBILITY_MIGRATION_IMPORT_MAX_BODY_BYTES;
    else process.env.BISIBILITY_MIGRATION_IMPORT_MAX_BODY_BYTES = previousLimit;
  });

  it("stops reading a streamed import package once it passes the limit", async () => {
    const counter = { pulled: 0 };
    const chunkCount = 64;

    const response = await POST(streamedRequest(chunkCount, counter) as NextRequest);

    expect(response.status).toBe(413);
    expect(counter.pulled).toBeLessThan(chunkCount);
    expect(mocks.verifyMigrationToken).not.toHaveBeenCalled();
  });

  it("returns bad request for an unreadable import package body", async () => {
    const response = await POST(unreadableRequest() as NextRequest);

    expect(response.status).toBe(400);
    expect(response.status).not.toBe(500);
    expect(mocks.verifyMigrationToken).not.toHaveBeenCalled();
  });

  it("stops reading a streamed import session body once it passes the limit", async () => {
    const counter = { pulled: 0 };
    const chunkCount = 64;

    await expect(
      readJsonBody(streamedRequest(chunkCount, counter), { limit: 4096 }),
    ).rejects.toBeInstanceOf(ImportSessionBodyError);
    expect(counter.pulled).toBeLessThan(chunkCount);
  });
});
