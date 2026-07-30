import { POST } from "@/app/api/cloud/import/route";
import { CloudImportTokenError } from "@/lib/api/cloud-import";
import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  createKeywords: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    cloudImportJob: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    keyword: { findMany: vi.fn() },
    migrationToken: { updateMany: vi.fn() },
    project: { findUnique: vi.fn(), updateMany: vi.fn() },
    rankCheck: { createMany: vi.fn(), findMany: vi.fn() },
  },
  rateLimitExceeded: vi.fn(),
  verifyMigrationToken: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/api/instance-import/token-verifier", () => ({
  verifyMigrationTokenInternal: mocks.verifyMigrationToken,
}));
vi.mock("@/lib/api/keyword-create", () => ({ createKeywords: mocks.createKeywords }));
vi.mock("@/lib/api/ratelimit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  rateLimitExceeded: mocks.rateLimitExceeded,
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const rawToken = "mig_valid_token_value_12345";
const url = "https://example.com/api/cloud/import";
const ids = {
  job: "imp_abcdefghijklmnopqrstuvwx",
  keyword: "kw_abcdefghijklmnopqrstuvwx",
  project: "prj_abcdefghijklmnopqrstuvwx",
  sourceProject: "prj_bbcdefghijklmnopqrstuvwx",
};

function project(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    domain: "example.com",
    id: "project_1",
    name: "Example",
    ownerId: "owner_1",
    publicId: ids.project,
    updatedAt: new Date("2026-06-02T00:00:00.000Z"),
    writeMode: "active",
    ...overrides,
  };
}

function jobRow(overrides: Record<string, unknown> = {}) {
  return {
    counts: null,
    createdAt: new Date("2026-06-28T12:00:00.000Z"),
    error: null,
    finishedAt: null,
    id: "job_1",
    publicId: ids.job,
    progress: 1,
    projectId: "project_1",
    startedAt: new Date("2026-06-28T12:00:00.000Z"),
    state: "receiving",
    tokenId: "token_1",
    ...overrides,
  };
}

function exportBody() {
  return {
    alert_rules: [],
    competitors: [],
    exported_at: "2026-06-28T11:00:00.000Z",
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
    notification_preferences: [],
    project_id: ids.sourceProject,
    saved_views: [],
    scope: "history",
    version: 5,
  };
}

function request(body: unknown, headers: HeadersInit = { authorization: `Bearer ${rawToken}` }) {
  return new Request(url, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
    method: "POST",
  }) as NextRequest;
}

function invalidJsonRequest(body = "{") {
  return new Request(url, {
    body,
    headers: { authorization: `Bearer ${rawToken}`, "content-type": "application/json" },
    method: "POST",
  }) as NextRequest;
}

function version4Package() {
  return exportBody();
}

function audit(action: string) {
  return mocks.writeAudit.mock.calls.find(([input]) => input.action === action)?.[0];
}

describe("POST /api/cloud/import hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-28T12:00:00.000Z"));
    mocks.verifyMigrationToken.mockResolvedValue({
      createdById: "user_1",
      id: "token_1",
      projectId: "project_1",
      projectPublicId: ids.project,
      publicId: "ferry_abcdefghijklmnopqrstuvwx",
      scope: "full",
      singleUse: true,
    });
    mocks.checkRateLimit.mockResolvedValue({ headers: new Headers(), success: true });
    mocks.rateLimitExceeded.mockImplementation((_limit) =>
      Response.json({ status: 429, title: "Rate limited" }, { status: 429 }),
    );
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
    mocks.prisma.project.findUnique.mockResolvedValue(project());
    mocks.prisma.project.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.cloudImportJob.findFirst.mockResolvedValue(jobRow());
    mocks.prisma.cloudImportJob.create.mockImplementation(({ data }) =>
      Promise.resolve(jobRow({ ...data, id: "job_created" })),
    );
    mocks.prisma.cloudImportJob.update.mockImplementation(({ data, where }) =>
      Promise.resolve(jobRow({ ...data, id: where.id })),
    );
    mocks.prisma.keyword.findMany.mockResolvedValue([
      { device: "desktop", id: "keyword_1", location: "United States", text: "rank tracker" },
    ]);
    mocks.prisma.rankCheck.createMany.mockResolvedValue({ count: 1 });
    mocks.prisma.rankCheck.findMany.mockResolvedValue([]);
    mocks.prisma.migrationToken.updateMany.mockResolvedValue({ count: 1 });
    mocks.createKeywords.mockResolvedValue(Response.json({ created: 1, skipped: 0 }));
    mocks.writeAudit.mockResolvedValue({ id: "audit_1" });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("returns 419 for expired migration tokens", async () => {
    mocks.verifyMigrationToken.mockRejectedValue(
      new CloudImportTokenError("Migration token is expired."),
    );

    const response = await POST(request(exportBody()));

    expect(response.status).toBe(419);
    await expect(response.json()).resolves.toMatchObject({ status: 419 });
    expect(mocks.prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it("does not classify a non-token expired error as token expiry", async () => {
    mocks.verifyMigrationToken.mockRejectedValue(
      new Error("A query cannot run because its transaction expired."),
    );

    const response = await POST(request(exportBody()));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({ detail: "Cloud import failed.", status: 500 });
    expect(body.detail).not.toContain("Migration token is invalid or expired.");
  });

  it("returns 419 when token consumption loses a replay race", async () => {
    mocks.prisma.migrationToken.updateMany.mockResolvedValue({ count: 0 });

    const response = await POST(request(exportBody()));

    expect(response.status).toBe(419);
    await expect(response.json()).resolves.toMatchObject({ status: 419 });
    expect(
      mocks.prisma.cloudImportJob.update.mock.calls.map(([input]) => input.data.state),
    ).not.toContain("done");
  });

  it("rejects the legacy Migration-Token header", async () => {
    const response = await POST(request(exportBody(), { "Migration-Token": rawToken }));

    expect(response.status).toBe(401);
    expect(mocks.verifyMigrationToken).not.toHaveBeenCalled();
  });

  it("rejects the legacy export envelope with Bearer authentication", async () => {
    const response = await POST(request({ export: exportBody() }));

    expect(response.status).toBe(400);
    expect(mocks.verifyMigrationToken).not.toHaveBeenCalled();
  });

  it.each(["{", '{"keywords":['])(
    "returns a handled 400 for invalid or truncated JSON body %j",
    async (payload) => {
      const response = await POST(invalidJsonRequest(payload));

      expect(response.status).toBe(400);
      expect(response.status).toBeLessThan(500);
      await expect(response.json()).resolves.toMatchObject({
        detail: "Request body must be valid JSON.",
        status: 400,
      });
      expect(mocks.verifyMigrationToken).not.toHaveBeenCalled();
    },
  );

  it("returns a handled 400 for an unknown package schema version", async () => {
    const response = await POST(request({ ...version4Package(), version: 99 }));

    expect(response.status).toBe(400);
    expect(response.status).toBeLessThan(500);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Request input failed validation.",
      status: 400,
    });
    expect(mocks.verifyMigrationToken).not.toHaveBeenCalled();
  });

  it("returns a handled 400 when a version 4 package omits a required section", async () => {
    const { saved_views: _savedViews, ...missingSection } = version4Package();
    const response = await POST(request(missingSection));

    expect(response.status).toBe(400);
    expect(response.status).toBeLessThan(500);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Request input failed validation.",
      status: 400,
    });
    expect(mocks.verifyMigrationToken).not.toHaveBeenCalled();
  });

  it("does not let an omitted version bypass version 4 section checks", async () => {
    const { saved_views: _savedViews, version: _version, ...missingSection } = version4Package();
    const response = await POST(request(missingSection));

    expect(response.status).toBe(400);
    expect(response.status).toBeLessThan(500);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Request input failed validation.",
      status: 400,
    });
    expect(mocks.verifyMigrationToken).not.toHaveBeenCalled();
  });

  it("returns a handled 400 for a wrong-typed package field", async () => {
    const response = await POST(request({ ...version4Package(), saved_views: "not-an-array" }));

    expect(response.status).toBe(400);
    expect(response.status).toBeLessThan(500);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Request input failed validation.",
      status: 400,
    });
    expect(mocks.verifyMigrationToken).not.toHaveBeenCalled();
  });

  it("returns 413 when the request body exceeds the configured limit", async () => {
    vi.stubEnv("BISIBILITY_MIGRATION_IMPORT_MAX_BODY_BYTES", "64");

    const response = await POST(request(exportBody()));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      detail:
        "Package exceeds the 64 bytes upload maximum. Reduce the package or use the chunked push flow.",
      status: 413,
    });
    expect(mocks.verifyMigrationToken).not.toHaveBeenCalled();
  });

  it("returns the actual and maximum keyword counts with a chunked-flow remedy", async () => {
    const response = await POST(
      request({ keywords: Array.from({ length: 501 }, () => ({ text: "keyword" })) }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      detail:
        "Package contains 501 keywords; this upload path supports up to 500. Reduce the package or use the chunked push flow.",
      status: 400,
    });
    expect(mocks.verifyMigrationToken).not.toHaveBeenCalled();
  });

  it("imports under the destination hold and releases it with the terminal job", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue(project({ writeMode: "migration_hold" }));

    const response = await POST(request(exportBody()));

    expect(response.status).toBe(201);
    expect(mocks.prisma.project.updateMany).toHaveBeenCalledWith({
      data: {
        writeMode: "active",
        writeModeChangedAt: new Date("2026-06-28T12:00:00.000Z"),
        writeModeChangedById: null,
      },
      where: { id: { in: ["project_1"] }, writeMode: "migration_hold" },
    });
  });

  it("returns 423 when the destination project was disabled after migration", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue(project({ writeMode: "migrated" }));

    const response = await POST(request(exportBody()));

    expect(response.status).toBe(423);
  });

  it("emits a cloud_import.done audit on success", async () => {
    const response = await POST(request(exportBody()));

    expect(response.status).toBe(201);
    expect(audit("cloud_import.done")).toMatchObject({
      action: "cloud_import.done",
      actorId: "user_1",
      after: { counts: expect.objectContaining({ history: 1, keywords: 1 }) },
      projectId: "project_1",
      targetId: ids.job,
      targetType: "cloud_import_job",
    });
  });

  it("emits a cloud_import.fail audit when import writes fail", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue(project({ writeMode: "migration_hold" }));
    mocks.prisma.rankCheck.createMany.mockRejectedValueOnce(new Error("history insert failed"));

    const response = await POST(request(exportBody()));

    expect(response.status).toBe(500);
    expect(mocks.prisma.project.updateMany).toHaveBeenCalledOnce();
    expect(audit("cloud_import.fail")).toMatchObject({
      action: "cloud_import.fail",
      actorId: "user_1",
      projectId: "project_1",
      targetId: ids.job,
      targetType: "cloud_import_job",
    });
  });

  it("retries the terminal failure transaction and releases the migration hold", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue(project({ writeMode: "migration_hold" }));
    mocks.prisma.rankCheck.createMany.mockRejectedValueOnce(new Error("history insert failed"));
    mocks.prisma.$transaction
      .mockImplementationOnce((callback) => callback(mocks.prisma))
      .mockRejectedValueOnce(new Error("database unavailable 1"))
      .mockRejectedValueOnce(new Error("database unavailable 2"))
      .mockImplementationOnce((callback) => callback(mocks.prisma));

    const responsePromise = POST(request(exportBody()));
    await vi.runAllTimersAsync();
    const response = await responsePromise;

    expect(response.status).toBe(500);
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(4);
    expect(
      mocks.prisma.cloudImportJob.update.mock.calls.map(([input]) => input.data.state),
    ).toContain("failed");
    expect(mocks.prisma.project.updateMany).toHaveBeenCalledOnce();
  });

  it("logs a structured error when every terminal failure write is rejected", async () => {
    const terminalError = new Error("database still unavailable");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.prisma.project.findUnique.mockResolvedValue(project({ writeMode: "migration_hold" }));
    mocks.prisma.rankCheck.createMany.mockRejectedValueOnce(new Error("history insert failed"));
    mocks.prisma.$transaction
      .mockImplementationOnce((callback) => callback(mocks.prisma))
      .mockRejectedValue(terminalError);

    const responsePromise = POST(request(exportBody()));
    await vi.runAllTimersAsync();
    const response = await responsePromise;

    expect(response.status).toBe(500);
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(4);
    expect(consoleError).toHaveBeenCalledWith(
      "[migration] terminal import failure write failed",
      expect.objectContaining({
        attempts: 3,
        error: terminalError,
        holdState: "migration_hold",
        jobId: "job_1",
        projectId: "project_1",
      }),
    );
    expect(mocks.prisma.project.updateMany).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
