import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    cloudImportJob: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    migrationToken: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    project: { findUnique: vi.fn() },
  },
  rateLimitExceeded: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/api/ratelimit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  consume: vi.fn(),
  rateLimitExceeded: mocks.rateLimitExceeded,
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/notifications/events", () => ({
  notifyCloudImportDone: vi.fn(() => Promise.resolve()),
  notifyCloudImportFailed: vi.fn(() => Promise.resolve()),
}));

const rawToken = "mig_valid_token_value_12345";
const stableTokenError = {
  detail: "Migration token is invalid or expired.",
  status: 419,
  title: "Unauthorized",
};

function request() {
  return new Request("https://example.com/api/cloud/import", {
    body: JSON.stringify({
      alert_rules: [],
      competitors: [],
      keywords: [],
      notification_preferences: [],
      project_id: "prj_bbcdefghijklmnopqrstuvwx",
      saved_views: [],
      version: 5,
    }),
    headers: {
      authorization: `Bearer ${rawToken}`,
      "content-type": "application/json",
    },
    method: "POST",
  }) as NextRequest;
}

function tokenRow(overrides: Record<string, unknown> = {}) {
  return {
    consumedAt: null,
    createdById: "user_1",
    expiresAt: new Date("2026-06-28T13:00:00.000Z"),
    id: "token_1",
    project: {
      id: "project_1",
      publicId: "prj_abcdefghijklmnopqrstuvwx",
      writeMode: "active",
    },
    projectId: "project_1",
    publicId: "ferry_abcdefghijklmnopqrstuvwx",
    scope: "full",
    singleUse: true,
    ...overrides,
  };
}

function project() {
  return {
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    domain: "example.com",
    id: "project_1",
    name: "Example",
    ownerId: "user_1",
    publicId: "prj_abcdefghijklmnopqrstuvwx",
    updatedAt: new Date("2026-06-02T00:00:00.000Z"),
    writeMode: "active",
    writeModeChangedAt: null,
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
    progress: 0,
    projectId: "project_1",
    startedAt: null,
    state: "idle",
    tokenId: "token_1",
    ...overrides,
  };
}

describe("POST /api/cloud/import token-denial contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-28T12:00:00.000Z"));
    mocks.checkRateLimit.mockResolvedValue({ headers: new Headers(), success: true });
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
    mocks.prisma.migrationToken.findUnique.mockResolvedValue(tokenRow());
    mocks.prisma.migrationToken.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.project.findUnique.mockResolvedValue(project());
    mocks.prisma.cloudImportJob.findFirst.mockResolvedValue(job());
    mocks.prisma.cloudImportJob.create.mockImplementation(({ data }) =>
      Promise.resolve(job({ ...data, id: "job_created" })),
    );
    mocks.prisma.cloudImportJob.update.mockImplementation(({ data, where }) =>
      Promise.resolve(job({ ...data, id: where.id })),
    );
    mocks.writeAudit.mockResolvedValue({ id: "audit_1" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    {
      deny: () => mocks.prisma.migrationToken.findUnique.mockResolvedValue(null),
      scenario: "invalid token",
    },
    {
      deny: () =>
        mocks.prisma.migrationToken.findUnique.mockResolvedValue(
          tokenRow({ expiresAt: new Date("2026-06-28T11:59:59.000Z") }),
        ),
      scenario: "expired token",
    },
    {
      deny: () => mocks.prisma.migrationToken.updateMany.mockResolvedValue({ count: 0 }),
      scenario: "consumed or already-used token",
    },
    {
      deny: () => mocks.prisma.project.findUnique.mockResolvedValue(null),
      scenario: "token project not found",
    },
  ])("returns the stable 419 response for $scenario", async ({ deny }) => {
    deny();

    const response = await POST(request());

    expect(response.status).toBe(419);
    await expect(response.json()).resolves.toMatchObject(stableTokenError);
  });
});
