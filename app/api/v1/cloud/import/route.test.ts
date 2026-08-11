import { CloudImportTokenError } from "@/lib/api/cloud-import";
import { ProjectReadOnlyError } from "@/lib/deployment/project-write-mode";
import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

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
    project: { findUnique: vi.fn() },
    rankCheck: { createMany: vi.fn(), findMany: vi.fn() },
  },
  rateLimitExceeded: vi.fn(),
  verifyMigrationToken: vi.fn(),
  writeAudit: vi.fn(() => Promise.resolve({ id: "audit_1" })),
}));

vi.mock("@/lib/auth/audit", () => ({
  writeAudit: mocks.writeAudit,
}));

vi.mock("@/lib/api/instance-import/token-verifier", () => ({
  verifyMigrationTokenInternal: mocks.verifyMigrationToken,
}));

vi.mock("@/lib/api/keyword-create", () => ({
  createKeywords: mocks.createKeywords,
}));

vi.mock("@/lib/api/ratelimit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  rateLimitExceeded: mocks.rateLimitExceeded,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: mocks.prisma,
}));

const rawToken = "mig_valid_token_value_12345";
const ids = {
  job: "imp_abcdefghijklmnopqrstuvwx",
  keyword: "kw_abcdefghijklmnopqrstuvwx",
  project: "prj_abcdefghijklmnopqrstuvwx",
  sourceProject: "prj_bbcdefghijklmnopqrstuvwx",
};

function project() {
  return {
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    domain: "example.com",
    id: "project_1",
    name: "Example",
    publicId: ids.project,
    updatedAt: new Date("2026-06-02T00:00:00.000Z"),
    writeMode: "active",
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
    progress: 0,
    projectId: "project_1",
    startedAt: null,
    state: "idle",
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
            normalizationVersion: "v1",
            position: 3,
            previousPosition: 7,
            provider: "dataforseo",
            rankingUrl: "https://example.com/rank-tracker",
            requestedDepth: 100,
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
    version: 6,
  };
}

function request(body: unknown, headers: HeadersInit = { authorization: `Bearer ${rawToken}` }) {
  return new Request("https://example.com/api/v1/cloud/import", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
    method: "POST",
  }) as NextRequest;
}

describe("POST /api/v1/cloud/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-28T12:00:00.000Z"));
    mocks.verifyMigrationToken.mockResolvedValue({
      id: "token_1",
      projectId: "project_1",
      projectPublicId: ids.project,
      publicId: "ferry_abcdefghijklmnopqrstuvwx",
      scope: "full",
      singleUse: true,
    });
    mocks.checkRateLimit.mockResolvedValue({ headers: new Headers(), success: true });
    mocks.rateLimitExceeded.mockImplementation((limit) =>
      Response.json(
        { status: 429, title: "Rate limited" },
        { headers: limit.headers, status: 429 },
      ),
    );
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
    mocks.prisma.project.findUnique.mockResolvedValue(project());
    mocks.prisma.cloudImportJob.findFirst.mockResolvedValue(jobRow());
    mocks.prisma.cloudImportJob.create.mockImplementation(({ data }) =>
      Promise.resolve(jobRow({ ...data, id: "job_created" })),
    );
    mocks.prisma.cloudImportJob.update.mockImplementation(({ data, where }) =>
      Promise.resolve(jobRow({ ...data, id: where.id })),
    );
    mocks.prisma.keyword.findMany.mockResolvedValue([
      {
        device: "desktop",
        id: "keyword_1",
        location: "United States",
        text: "rank tracker",
      },
    ]);
    mocks.prisma.rankCheck.createMany.mockResolvedValue({ count: 1 });
    mocks.prisma.rankCheck.findMany.mockResolvedValue([]);
    mocks.prisma.migrationToken.updateMany.mockResolvedValue({ count: 1 });
    mocks.createKeywords.mockResolvedValue(Response.json({ created: 1, skipped: 0 }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("imports keywords and history with a bearer migration token", async () => {
    const response = await POST(request(exportBody()));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      counts: {
        alert_rules: 0,
        alert_rules_skipped: 0,
        competitors: 0,
        competitors_skipped: 0,
        history: 1,
        history_received: 1,
        history_skipped: 0,
        keywords: 1,
        keywords_created: 1,
        keywords_skipped: 0,
        notification_preferences: 0,
        notification_preferences_skipped: 0,
        saved_views: 0,
        saved_views_skipped: 0,
      },
      job_id: ids.job,
      state: "done",
    });
    expect(mocks.verifyMigrationToken).toHaveBeenCalledWith(rawToken);
    expect(mocks.createKeywords).toHaveBeenCalledOnce();
    const [ctx, projectId] = mocks.createKeywords.mock.calls[0];
    await expect(ctx.req.json()).resolves.toEqual([
      {
        device: "desktop",
        keyword: "rank tracker",
        location: "United States",
        tags: ["SEO"],
        target_url: "/rank",
      },
    ]);
    expect(projectId).toBe("project_1");
    expect(
      mocks.prisma.cloudImportJob.update.mock.calls.map(([input]) => input.data.state),
    ).toEqual(["receiving", "importing", "done"]);
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
          rankingUrl: "https://example.com/rank-tracker",
          requestedDepth: 100,
          status: "completed",
          viaFallback: false,
        },
      ],
    });
  });

  it("rejects legacy rank_checks packages", async () => {
    const response = await POST(
      request({
        exported_at: "2026-06-28T11:00:00.000Z",
        keywords: [
          {
            device: "desktop",
            id: "kw_cli_1",
            location: "United States",
            tags: ["SEO"],
            target_url: "/rank",
            text: "rank tracker",
          },
        ],
        project_id: "self_hosted_project",
        rank_checks: [
          {
            checked_at: "2026-06-21T10:00:00.000Z",
            keyword_id: "kw_cli_1",
            position: 2,
            previous_position: 5,
            ranking_url: "https://example.com/rank-tracker",
          },
        ],
        version: 1,
      }),
    );
    expect(response.status).toBe(400);
    expect(mocks.verifyMigrationToken).not.toHaveBeenCalled();
  });

  it("rejects a body token and nested export payload", async () => {
    const response = await POST(
      request(
        {
          export: {
            alert_rules: [],
            competitors: [],
            keywords: [
              {
                device: "desktop",
                id: ids.keyword,
                keyword: "body token keyword",
                location: "United States",
                tags: [],
              },
            ],
            notification_preferences: [],
            project_id: ids.sourceProject,
            saved_views: [],
            scope: "current",
            version: 6,
          },
          migrationToken: rawToken,
        },
        {},
      ),
    );

    expect(response.status).toBe(401);
    expect(mocks.verifyMigrationToken).not.toHaveBeenCalled();
  });

  it("returns 419 for invalid or expired migration tokens", async () => {
    mocks.verifyMigrationToken.mockRejectedValue(
      new CloudImportTokenError("Migration token is invalid or expired."),
    );

    const response = await POST(request(exportBody()));

    expect(response.status).toBe(419);
    await expect(response.json()).resolves.toMatchObject({
      status: 419,
      title: "Unauthorized",
    });
    expect(mocks.prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it("returns 423 when the token project is read-only", async () => {
    mocks.verifyMigrationToken.mockRejectedValue(new ProjectReadOnlyError("project_1"));

    const response = await POST(request(exportBody()));

    expect(response.status).toBe(423);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Destination project is in migration hold - release it before importing.",
      status: 423,
      title: "Project read-only",
      type: expect.stringContaining("project_read_only"),
    });
    expect(mocks.prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it("returns 401 when no migration token is supplied", async () => {
    const response = await POST(request(exportBody(), {}));

    expect(response.status).toBe(401);
    expect(mocks.verifyMigrationToken).not.toHaveBeenCalled();
  });

  it("rate limits by client IP before verifying the migration token", async () => {
    mocks.checkRateLimit.mockResolvedValueOnce({
      headers: new Headers({ "Retry-After": "60" }),
      success: false,
    });

    const response = await POST(request(exportBody()));

    expect(response.status).toBe(429);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(expect.any(Request), { kind: "anonymous" });
    expect(mocks.verifyMigrationToken).not.toHaveBeenCalled();
  });

  it("rate limits by migration token and project after verification", async () => {
    mocks.checkRateLimit
      .mockResolvedValueOnce({ headers: new Headers(), success: true })
      .mockResolvedValueOnce({
        headers: new Headers({ "Retry-After": "60" }),
        success: false,
      });

    const response = await POST(request(exportBody()));

    expect(response.status).toBe(429);
    expect(mocks.verifyMigrationToken).toHaveBeenCalledWith(rawToken);
    expect(mocks.checkRateLimit).toHaveBeenNthCalledWith(2, expect.any(Request), {
      id: "cloud-import:project_1:token_1",
      kind: "api-key",
    });
    expect(mocks.prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed export payloads", async () => {
    const response = await POST(request({ keywords: [{ keyword: "" }] }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      status: 400,
      title: "Validation failed",
    });
    expect(mocks.verifyMigrationToken).not.toHaveBeenCalled();
  });
});
