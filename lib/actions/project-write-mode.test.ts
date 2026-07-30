import { beforeEach, describe, expect, it, vi } from "vitest";
import { cancelMigration } from "./project-write-mode";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    cloudImportJob: {
      findFirst: vi.fn(),
      updateManyAndReturn: vi.fn(),
    },
    migrationImportChunk: { deleteMany: vi.fn() },
    project: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    user: { findUnique: vi.fn() },
  },
  requireSession: vi.fn(),
  revalidatePath: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

const heldProject = {
  id: "project_1",
  ownerId: "user_1",
  publicId: "prj_abcdefghijklmnopqrstuvwx",
  writeMode: "migration_hold",
  writeModeChangedAt: new Date("2026-07-23T10:00:00.000Z"),
  writeModeChangedById: "user_1",
};
const publicProjectId = "prj_abcdefghijklmnopqrstuvwx";

const idleJob = {
  error: null,
  id: "job_1",
  publicId: "imp_abcdefghijklmnopqrstuvwx",
  projectId: "project_1",
  state: "idle",
};

describe("project migration cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.prisma.user.findUnique.mockResolvedValue({
      memberships: [{ projectId: "project_1", role: "admin" }],
      role: "member",
    });
    mocks.prisma.project.findFirst.mockResolvedValue(heldProject);
    mocks.prisma.$transaction.mockImplementation((run) => run(mocks.prisma));
    mocks.prisma.cloudImportJob.findFirst.mockResolvedValue(idleJob);
    mocks.prisma.cloudImportJob.updateManyAndReturn.mockResolvedValue([
      { ...idleJob, error: "Migration cancelled.", state: "failed" },
    ]);
    mocks.prisma.migrationImportChunk.deleteMany.mockResolvedValue({ count: 2 });
    mocks.prisma.project.update.mockResolvedValue({ ...heldProject, writeMode: "active" });
    mocks.writeAudit.mockResolvedValue({ id: "audit_1" });
  });

  it("fails the held nonterminal job, clears chunks, audits, and releases in one transaction", async () => {
    const result = await cancelMigration({ projectId: publicProjectId });

    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
    expect(mocks.prisma.cloudImportJob.updateManyAndReturn).toHaveBeenCalledWith({
      data: {
        error: "Migration cancelled.",
        finishedAt: expect.any(Date),
        state: "failed",
      },
      where: {
        id: "job_1",
        state: { in: ["idle", "receiving", "importing"] },
      },
    });
    expect(mocks.prisma.migrationImportChunk.deleteMany).toHaveBeenCalledWith({
      where: { jobId: "job_1" },
    });
    expect(mocks.prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ writeMode: "active", writeModeChangedById: "user_1" }),
      }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledTimes(2);
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "cloud_import.cancel",
        after: expect.objectContaining({ id: "imp_abcdefghijklmnopqrstuvwx" }),
        targetId: "imp_abcdefghijklmnopqrstuvwx",
      }),
      mocks.prisma,
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "project.migration_hold.cancel",
        targetId: "prj_abcdefghijklmnopqrstuvwx",
      }),
      mocks.prisma,
    );
    expect(result).toMatchObject({
      importJob: {
        error: "Migration cancelled.",
        id: "imp_abcdefghijklmnopqrstuvwx",
        state: "failed",
      },
      projectId: "prj_abcdefghijklmnopqrstuvwx",
      writeMode: "active",
    });
  });

  it("rejects a raw project ID before changing migration state", async () => {
    await expect(cancelMigration({ projectId: "project_1" })).rejects.toThrow(
      "Expected a strict prj_ v3 public ID.",
    );
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("terminalizes an idle token job on explicit cancel even without a hold", async () => {
    mocks.prisma.project.findFirst
      .mockResolvedValueOnce({ ...heldProject, writeMode: "active" })
      .mockResolvedValueOnce(null);

    const result = await cancelMigration({ projectId: publicProjectId });

    // Explicit cancel is truthful: the nonterminal job is failed and chunks cleared,
    // but there is no hold to release, so the project is left untouched.
    expect(mocks.prisma.cloudImportJob.updateManyAndReturn).toHaveBeenCalledWith({
      data: {
        error: "Migration cancelled.",
        finishedAt: expect.any(Date),
        state: "failed",
      },
      where: { id: "job_1", state: { in: ["idle", "receiving", "importing"] } },
    });
    expect(mocks.prisma.migrationImportChunk.deleteMany).toHaveBeenCalledWith({
      where: { jobId: "job_1" },
    });
    expect(mocks.prisma.project.update).not.toHaveBeenCalled();
    expect(mocks.writeAudit).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      importJob: {
        error: "Migration cancelled.",
        id: "imp_abcdefghijklmnopqrstuvwx",
        state: "failed",
      },
      projectId: "prj_abcdefghijklmnopqrstuvwx",
      writeMode: "active",
    });
  });

  it("preserves an idle token job for non-cancel flows (mere token minting)", async () => {
    // Token minting creates an idle job but never routes through cancelMigration,
    // so no terminalization happens outside an explicit user cancel.
    mocks.prisma.project.findFirst
      .mockResolvedValueOnce({ ...heldProject, writeMode: "active" })
      .mockResolvedValueOnce(null);
    mocks.prisma.cloudImportJob.findFirst.mockResolvedValue(null);

    await expect(cancelMigration({ projectId: publicProjectId })).resolves.toMatchObject({
      importJob: null,
      writeMode: "active",
    });

    expect(mocks.prisma.cloudImportJob.updateManyAndReturn).not.toHaveBeenCalled();
    expect(mocks.prisma.migrationImportChunk.deleteMany).not.toHaveBeenCalled();
    expect(mocks.prisma.project.update).not.toHaveBeenCalled();
  });
});
