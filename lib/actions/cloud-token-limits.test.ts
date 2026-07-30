import { hashApiKey } from "@/lib/providers/crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mintMigrationToken } from "./cloud";

const projectPublicId = "prj_a00000000000000000000000";

const mocks = vi.hoisted(() => {
  class AuthorizationError extends Error {
    code: "forbidden" | "unauthenticated";

    constructor(code: "forbidden" | "unauthenticated") {
      super("You are not authorized to perform this action.");
      this.code = code;
      this.name = "AuthorizationError";
    }
  }

  return {
    AuthorizationError,
    authorize: vi.fn(),
    consume: vi.fn(),
    prisma: {
      $transaction: vi.fn(),
      cloudImportJob: { create: vi.fn() },
      migrationToken: { create: vi.fn(), updateMany: vi.fn() },
      project: { findFirst: vi.fn() },
      user: { findUnique: vi.fn() },
    },
    requireSession: vi.fn(),
    revalidatePath: vi.fn(),
    writeAudit: vi.fn(),
    writeAuditFailure: vi.fn(() => Promise.resolve({ id: "audit_failed_1" })),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/api/ratelimit", () => ({ consume: mocks.consume }));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.writeAudit,
  writeAuditFailure: mocks.writeAuditFailure,
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/notifications/events", () => ({}));
vi.mock("@/lib/auth/authorize", () => ({
  AuthorizationError: mocks.AuthorizationError,
  authorize: mocks.authorize,
}));

function mockActor() {
  mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
  mocks.prisma.user.findUnique.mockResolvedValue({
    memberships: [{ projectId: "project_1", role: "admin" }],
    role: "member",
  });
  mocks.prisma.project.findFirst.mockResolvedValue({
    id: "project_1",
    ownerId: "user_1",
    publicId: projectPublicId,
  });
}

describe("cloud migration token limits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-28T12:00:00.000Z"));
    mockActor();
    mocks.consume.mockResolvedValue({
      limit: 10,
      remaining: 9,
      resetAt: Date.now() + 3600_000,
      success: true,
    });
    mocks.prisma.$transaction.mockImplementation((fn) => fn(mocks.prisma));
    mocks.prisma.migrationToken.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.migrationToken.create.mockImplementation(({ data }) =>
      Promise.resolve({
        createdAt: new Date("2026-06-28T12:00:00.000Z"),
        createdById: data.createdById,
        consumedAt: null,
        expiresAt: data.expiresAt,
        id: "token_1",
        publicId: data.publicId,
        scope: data.scope,
        singleUse: data.singleUse,
      }),
    );
    mocks.prisma.cloudImportJob.create.mockResolvedValue({
      counts: null,
      createdAt: new Date("2026-06-28T12:00:00.000Z"),
      error: null,
      finishedAt: null,
      id: "job_1",
      progress: 0,
      publicId: "imp_a00000000000000000000000",
      startedAt: null,
      state: "idle",
    });
    mocks.writeAudit.mockResolvedValue({ id: "audit_1" });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it.each([
    ["1", "2026-06-28T12:05:00.000Z"],
    ["2000", "2026-06-29T12:00:00.000Z"],
  ])("clamps token TTL env value %s", async (ttl, expiresAt) => {
    vi.stubEnv("BISIBILITY_MIGRATION_TOKEN_TTL_MINUTES", ttl);

    await expect(
      mintMigrationToken({ projectId: projectPublicId, scope: "full" }),
    ).resolves.toMatchObject({ expiresAt });
  });

  it("rate limits migration token minting per user", async () => {
    mocks.consume.mockResolvedValueOnce({
      limit: 10,
      remaining: 0,
      resetAt: Date.now() + 3600_000,
      success: false,
    });

    await expect(mintMigrationToken({ projectId: projectPublicId, scope: "full" })).rejects.toThrow(
      "Migration token rate limit exceeded.",
    );
    expect(mocks.consume).toHaveBeenCalledWith({
      bucketKey: "user_1",
      limit: 10,
      prefix: "bisibility:migration-token-mint",
      windowSeconds: 3600,
    });
    expect(mocks.prisma.migrationToken.create).not.toHaveBeenCalled();
  });

  it("stores only the token hash when the rate limit allows minting", async () => {
    let stored: Record<string, unknown> | undefined;
    mocks.prisma.migrationToken.create.mockImplementation(({ data }) => {
      stored = data;
      return Promise.resolve({
        createdAt: new Date("2026-06-28T12:00:00.000Z"),
        consumedAt: null,
        expiresAt: data.expiresAt,
        id: "token_1",
        publicId: data.publicId,
        scope: data.scope,
        singleUse: data.singleUse,
      });
    });

    const result = await mintMigrationToken({ projectId: projectPublicId, scope: "full" });

    expect(stored?.hash).toBe(hashApiKey(result.token));
    expect(stored?.hash).not.toContain(result.token);
  });
});
