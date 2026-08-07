import { hashApiKey } from "@/lib/providers/crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  advanceCloudImportJob,
  createCloudImportWorkspace,
  mintMigrationToken,
  mintMigrationTokenResult,
  pollCloudImportJob,
  regenerateMigrationToken,
  revokeMigrationToken,
  revokeMigrationTokenResult,
} from "./cloud";

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
    createProject: vi.fn(),
    getCloudImportJobStatus: vi.fn(),
    isCloud: true,
    notifyCloudImportDone: vi.fn(() => Promise.resolve()),
    notifyCloudImportFailed: vi.fn(() => Promise.resolve()),
    prisma: {
      $transaction: vi.fn(),
      cloudImportJob: {
        create: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      migrationToken: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      project: { findFirst: vi.fn() },
      user: { findUnique: vi.fn() },
    },
    requireSession: vi.fn(),
    redirect: vi.fn(),
    revalidatePath: vi.fn(),
    requiredPublicAuditId: vi.fn((id: string) => id),
    writeAudit: vi.fn(),
    writeAuditFailure: vi.fn(() => Promise.resolve({ id: "audit_failed_1" })),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("./project", () => ({ createProject: mocks.createProject }));
vi.mock("@/lib/queries/cloud", () => ({ getCloudImportJobStatus: mocks.getCloudImportJobStatus }));
vi.mock("@/lib/api/ratelimit", () => ({ consume: mocks.consume }));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: mocks.requiredPublicAuditId,
  writeAudit: mocks.writeAudit,
  writeAuditFailure: mocks.writeAuditFailure,
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/deployment/deployment", () => ({
  get isCloud() {
    return mocks.isCloud;
  },
  get isSelfHost() {
    return !mocks.isCloud;
  },
}));
vi.mock("@/lib/notifications/events", () => ({
  notifyCloudImportDone: mocks.notifyCloudImportDone,
  notifyCloudImportFailed: mocks.notifyCloudImportFailed,
}));
vi.mock("@/lib/auth/authorize", () => ({
  AuthorizationError: mocks.AuthorizationError,
  authorize: mocks.authorize,
}));

const ids = {
  job: "imp_abcdefghijklmnopqrstuvwx",
  project: "prj_abcdefghijklmnopqrstuvwx",
  token: "ferry_abcdefghijklmnopqrstuvwx",
};

function mockActor(role = "admin") {
  mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
  mocks.prisma.user.findUnique.mockResolvedValue({
    memberships: [{ projectId: "project_1", role }],
    role: "member",
  });
  mocks.prisma.project.findFirst.mockResolvedValue({
    id: "project_1",
    ownerId: "user_1",
    publicId: ids.project,
  });
}

function tokenRow(overrides: Record<string, unknown> = {}) {
  return {
    consumedAt: null,
    createdById: "user_1",
    expiresAt: new Date("2026-06-28T13:00:00.000Z"),
    id: "token_1",
    publicId: ids.token,
    project: { id: "project_1", writeMode: "active" },
    projectId: "project_1",
    scope: "full",
    singleUse: true,
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
    progress: 0,
    projectId: "project_1",
    startedAt: null,
    state: "idle",
    tokenId: "token_1",
    ...overrides,
  };
}

describe("cloud migration actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isCloud = true;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-28T12:00:00.000Z"));
    mockActor();
    mocks.prisma.$transaction.mockImplementation((fn) => fn(mocks.prisma));
    mocks.consume.mockResolvedValue({
      limit: 10,
      remaining: 9,
      resetAt: Date.now() + 3600_000,
      success: true,
    });
    mocks.prisma.migrationToken.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.migrationToken.create.mockImplementation(({ data }) =>
      Promise.resolve({
        createdAt: new Date("2026-06-28T12:00:00.000Z"),
        createdById: data.createdById,
        expiresAt: data.expiresAt,
        id: "token_1",
        publicId: ids.token,
        scope: data.scope,
        singleUse: data.singleUse,
      }),
    );
    mocks.prisma.cloudImportJob.create.mockImplementation(({ data }) =>
      Promise.resolve(jobRow({ ...data, id: "job_1", publicId: ids.job })),
    );
    mocks.writeAudit.mockResolvedValue({ id: "audit_1" });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("mints a token once, stores only its hash and creates an idle import job", async () => {
    let stored: Record<string, unknown> | undefined;
    mocks.prisma.migrationToken.create.mockImplementation(({ data }) => {
      stored = data;
      return Promise.resolve({
        createdAt: new Date("2026-06-28T12:00:00.000Z"),
        createdById: data.createdById,
        expiresAt: data.expiresAt,
        id: "token_1",
        publicId: ids.token,
        scope: data.scope,
        singleUse: data.singleUse,
      });
    });

    const result = await mintMigrationToken({ projectId: ids.project, scope: "full" });

    expect(result.token).toMatch(/^mig_/);
    expect(stored?.hash).toBe(hashApiKey(result.token));
    expect(stored?.hash).not.toContain(result.token);
    expect(stored).toMatchObject({
      createdById: "user_1",
      projectId: "project_1",
      scope: "full",
      singleUse: true,
    });
    expect(stored?.expiresAt).toEqual(new Date("2026-06-28T13:00:00.000Z"));
    expect(mocks.prisma.cloudImportJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          progress: 0,
          projectId: "project_1",
          publicId: expect.stringMatching(/^imp_[a-z][a-z0-9]{23}$/),
          state: "idle",
          tokenId: "token_1",
        }),
      }),
    );
  });

  it("returns a handled 423 result when migration hold blocks token minting", async () => {
    mocks.prisma.project.findFirst.mockResolvedValue({
      id: "project_1",
      ownerId: "user_1",
      publicId: ids.project,
      writeMode: "migration_hold",
    });

    await expect(
      mintMigrationTokenResult({ projectId: ids.project, scope: "full" }),
    ).resolves.toMatchObject({
      error: { code: "project_read_only", status: 423 },
      ok: false,
    });

    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.prisma.migrationToken.create).not.toHaveBeenCalled();
  });

  it("advances through legal import states and completes at 100 percent", async () => {
    mocks.prisma.cloudImportJob.findFirst.mockResolvedValue(jobRow({ state: "importing" }));
    mocks.prisma.cloudImportJob.update.mockResolvedValue(
      jobRow({
        counts: { keywords: 248 },
        finishedAt: new Date("2026-06-28T12:00:00.000Z"),
        progress: 100,
        state: "done",
      }),
    );

    const result = await advanceCloudImportJob({
      counts: { keywords: 248 },
      jobId: ids.job,
      projectId: ids.project,
      state: "done",
    });

    expect(result).toMatchObject({ counts: { keywords: 248 }, progress: 100, state: "done" });
    expect(mocks.prisma.cloudImportJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ counts: { keywords: 248 }, progress: 100, state: "done" }),
      }),
    );
    expect(mocks.notifyCloudImportDone).toHaveBeenCalledWith({
      counts: { keywords: 248 },
      jobId: "job_1",
      projectId: "project_1",
    });
  });

  it("keeps a completed import successful when notification creation fails", async () => {
    mocks.notifyCloudImportDone.mockRejectedValueOnce(new Error("notify failed"));
    mocks.prisma.cloudImportJob.findFirst.mockResolvedValue(jobRow({ state: "importing" }));
    mocks.prisma.cloudImportJob.update.mockResolvedValue(jobRow({ progress: 100, state: "done" }));

    await expect(
      advanceCloudImportJob({ jobId: ids.job, projectId: ids.project, state: "done" }),
    ).resolves.toMatchObject({ progress: 100, state: "done" });
  });

  it("blocks illegal import state jumps", async () => {
    mocks.prisma.cloudImportJob.findFirst.mockResolvedValue(jobRow({ state: "idle" }));

    await expect(
      advanceCloudImportJob({ jobId: ids.job, projectId: ids.project, state: "done" }),
    ).rejects.toThrow("Cannot advance cloud import from idle to done.");

    expect(mocks.prisma.cloudImportJob.update).not.toHaveBeenCalled();
  });

  it("marks failed imports terminal and emits the failure notification", async () => {
    mocks.prisma.cloudImportJob.findFirst.mockResolvedValue(
      jobRow({ progress: 40, state: "importing" }),
    );
    mocks.prisma.cloudImportJob.update.mockImplementation(({ data }) =>
      Promise.resolve(jobRow({ ...data, id: "job_1" })),
    );

    const result = await advanceCloudImportJob({
      jobId: ids.job,
      projectId: ids.project,
      state: "failed",
    });

    expect(result).toMatchObject({ error: "Cloud import failed.", progress: 40, state: "failed" });
    expect(mocks.notifyCloudImportFailed).toHaveBeenCalledWith({
      error: "Cloud import failed.",
      jobId: "job_1",
      projectId: "project_1",
    });
  });

  it("reports missing import jobs", async () => {
    mocks.prisma.cloudImportJob.findFirst.mockResolvedValue(null);
    await expect(
      advanceCloudImportJob({ jobId: ids.job, projectId: ids.project, state: "importing" }),
    ).rejects.toThrow("Cloud import job not found.");
  });

  it("regenerates tokens and revokes a selected active token", async () => {
    const token = tokenRow({ consumedAt: null });
    mocks.prisma.migrationToken.findFirst.mockResolvedValue(token);
    mocks.prisma.migrationToken.update.mockResolvedValue({
      ...token,
      consumedAt: new Date("2026-06-28T12:00:00.000Z"),
    });

    await expect(
      regenerateMigrationToken({ projectId: ids.project, scope: "keywords" }),
    ).resolves.toMatchObject({ scope: "keywords" });
    await expect(
      revokeMigrationToken({ projectId: ids.project, tokenId: ids.token }),
    ).resolves.toEqual({ id: ids.token, revokedAt: "2026-06-28T12:00:00.000Z" });
    expect(mocks.prisma.migrationToken.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ publicId: ids.token, projectId: "project_1" }),
      }),
    );
  });

  it("rejects revocation when no active token remains", async () => {
    mocks.prisma.migrationToken.findFirst.mockResolvedValue(null);
    await expect(revokeMigrationToken({ projectId: ids.project })).rejects.toThrow(
      "Migration token is no longer active.",
    );
    await expect(revokeMigrationTokenResult({ projectId: ids.project })).resolves.toEqual({
      error: {
        code: "migration_token_not_active",
        message: "This migration token is no longer active. Create a new token to continue.",
        status: 409,
      },
      ok: false,
    });
  });

  it("reports an already-consumed token as a handled outcome, not a fake revoke", async () => {
    const consumedAt = new Date("2026-06-28T11:59:00.000Z");
    mocks.prisma.migrationToken.findFirst.mockResolvedValue(tokenRow({ consumedAt }));

    await expect(
      revokeMigrationToken({ projectId: ids.project, tokenId: ids.token }),
    ).rejects.toThrow("Migration token was already consumed.");
    await expect(
      revokeMigrationTokenResult({ projectId: ids.project, tokenId: ids.token }),
    ).resolves.toEqual({
      error: {
        code: "migration_token_already_consumed",
        message: "This migration token has already been used. Create a new token to continue.",
        status: 409,
      },
      ok: false,
    });
    expect(mocks.prisma.migrationToken.updateMany).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("reports a token consumed mid-revoke as already consumed without overwriting it", async () => {
    const consumedAt = new Date("2026-06-28T11:59:59.000Z");
    mocks.prisma.migrationToken.findFirst
      .mockResolvedValueOnce(tokenRow())
      .mockResolvedValueOnce(tokenRow({ consumedAt }));
    mocks.prisma.migrationToken.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      revokeMigrationTokenResult({ projectId: ids.project, tokenId: ids.token }),
    ).resolves.toEqual({
      error: {
        code: "migration_token_already_consumed",
        message: "This migration token has already been used. Create a new token to continue.",
        status: 409,
      },
      ok: false,
    });
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("revokes an expired but unconsumed token idempotently", async () => {
    mocks.prisma.migrationToken.findFirst.mockResolvedValue(
      tokenRow({ consumedAt: null, expiresAt: new Date("2020-01-01T00:00:00.000Z") }),
    );
    mocks.prisma.migrationToken.updateMany.mockResolvedValueOnce({ count: 1 });

    await expect(
      revokeMigrationTokenResult({ projectId: ids.project, tokenId: ids.token }),
    ).resolves.toEqual({
      ok: true,
      value: { id: ids.token, revokedAt: "2026-06-28T12:00:00.000Z" },
    });
    expect(mocks.writeAudit).toHaveBeenCalledTimes(1);
  });

  it("revokes the latest active token and falls back to the current timestamp", async () => {
    mocks.prisma.migrationToken.findFirst.mockResolvedValue(tokenRow());
    mocks.prisma.migrationToken.update.mockResolvedValue({
      consumedAt: null,
      id: "token_1",
    });
    await expect(revokeMigrationToken({ projectId: ids.project })).resolves.toEqual({
      id: ids.token,
      revokedAt: "2026-06-28T12:00:00.000Z",
    });
    expect(mocks.prisma.migrationToken.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.not.objectContaining({ id: expect.anything() }) }),
    );
  });

  it("validates polling input and delegates the job lookup", async () => {
    mocks.getCloudImportJobStatus.mockResolvedValue({ id: "job_1", state: "receiving" });
    await expect(pollCloudImportJob({ projectId: ids.project })).resolves.toEqual({
      id: "job_1",
      state: "receiving",
    });
    expect(mocks.getCloudImportJobStatus).toHaveBeenCalledWith(ids.project);
    await expect(pollCloudImportJob({})).rejects.toThrow();
  });

  it.each(["project_1", ` ${ids.project}`, ids.project.toUpperCase()])(
    "rejects a non-exact project public ID at the action boundary: %s",
    async (projectId) => {
      await expect(pollCloudImportJob({ projectId })).rejects.toThrow(
        "Expected a strict prj_ v3 public ID.",
      );
      expect(mocks.getCloudImportJobStatus).not.toHaveBeenCalled();
    },
  );

  it("creates a dedicated import workspace and redirects to its onboarding import", async () => {
    mocks.createProject.mockResolvedValue({
      id: "project_new",
      publicId: "prj_bbcdefghijklmnopqrstuvwx",
    });

    await createCloudImportWorkspace();

    expect(mocks.createProject).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).toHaveBeenCalledTimes(1);
    expect(mocks.createProject).toHaveBeenCalledWith({
      domain: expect.stringMatching(/^workspace-[a-f0-9]{8}\.bisibility\.cloud$/),
      name: "New workspace",
    });
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/cloud/import?ctx=onboard&project=prj_bbcdefghijklmnopqrstuvwx",
    );
  });

  it("rejects import workspace creation on self-hosted deployments", async () => {
    mocks.isCloud = false;

    await expect(createCloudImportWorkspace()).rejects.toThrow(
      "Cloud import workspaces are available only on Cloud deployments.",
    );

    expect(mocks.createProject).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
