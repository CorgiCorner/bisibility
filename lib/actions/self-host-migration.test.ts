import {
  rollbackSelfHostMigration,
  startSelfHostMigration,
} from "@/lib/actions/self-host-migration";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deploymentMode: vi.fn(),
  exportPackage: vi.fn(),
  getActionActor: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    project: { findUniqueOrThrow: vi.fn(), updateManyAndReturn: vi.fn() },
  },
  requireProjectScope: vi.fn(),
  revalidateSettingsViews: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/deployment/deployment", () => ({ deploymentMode: mocks.deploymentMode }));
vi.mock("@/lib/actions/keyword-import-export", () => ({
  exportCloudImportPackage: mocks.exportPackage,
}));
vi.mock("@/lib/actions/_shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/actions/_shared")>()),
  getActionActor: mocks.getActionActor,
  requireProjectScope: mocks.requireProjectScope,
  revalidateSettingsViews: mocks.revalidateSettingsViews,
}));

const projectId = "prj_abcdefghijklmnopqrstuvwx";
const now = new Date("2026-08-09T12:00:00.000Z");
const activeProject = {
  id: "project_1",
  publicId: projectId,
  writeMode: "active",
  writeModeChangedAt: null,
  writeModeChangedById: null,
};
const packageFile = {
  content: "{}",
  counts: { keywords: 2, rankChecks: 8 },
  filename: `bisibility-cloud-import-${projectId}.json`,
  mimeType: "application/json",
};

describe("hosted move to self-host", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    mocks.deploymentMode.mockReturnValue("cloud");
    mocks.getActionActor.mockResolvedValue({ id: "user_1", memberships: [], role: "member" });
    mocks.requireProjectScope.mockResolvedValue(activeProject);
    mocks.prisma.$transaction.mockImplementation((run) => run(mocks.prisma));
    mocks.prisma.project.updateManyAndReturn.mockResolvedValue([
      {
        ...activeProject,
        writeMode: "migration_hold",
        writeModeChangedAt: now,
        writeModeChangedById: "user_1",
      },
    ]);
    mocks.prisma.project.findUniqueOrThrow.mockResolvedValue(activeProject);
    mocks.exportPackage.mockResolvedValue(packageFile);
    mocks.writeAudit.mockResolvedValue({ id: "audit_1" });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("acquires a hold before exporting and returns the exact release time", async () => {
    const result = await startSelfHostMigration({ projectId });

    expect(mocks.requireProjectScope).toHaveBeenCalledWith(
      expect.anything(),
      "manage",
      projectId,
      { type: "project" },
      { allowReadOnly: true },
    );
    expect(mocks.prisma.project.updateManyAndReturn).toHaveBeenCalledWith({
      data: {
        writeMode: "migration_hold",
        writeModeChangedAt: now,
        writeModeChangedById: "user_1",
      },
      select: {
        id: true,
        publicId: true,
        writeMode: true,
        writeModeChangedAt: true,
        writeModeChangedById: true,
      },
      where: { id: "project_1", writeMode: "active" },
    });
    expect(mocks.exportPackage).toHaveBeenCalledWith({ projectId });
    expect(mocks.prisma.project.updateManyAndReturn.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.exportPackage.mock.invocationCallOrder[0],
    );
    expect(result).toEqual({
      migration: {
        autoReleasesAt: "2026-08-10T12:00:00.000Z",
        canRollback: true,
        startedAt: "2026-08-09T12:00:00.000Z",
        writeMode: "migration_hold",
      },
      packageFile,
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "project.migration_hold.enable" }),
      mocks.prisma,
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "project.self_host_migration.start" }),
    );
  });

  it("keeps an existing hold timestamp instead of extending the release window", async () => {
    const heldAt = new Date("2026-08-09T08:00:00.000Z");
    const held = { ...activeProject, writeMode: "migration_hold", writeModeChangedAt: heldAt };
    mocks.requireProjectScope.mockResolvedValue(held);
    mocks.prisma.project.updateManyAndReturn.mockResolvedValue([]);
    mocks.prisma.project.findUniqueOrThrow.mockResolvedValue(held);

    await expect(startSelfHostMigration({ projectId })).resolves.toMatchObject({
      migration: {
        autoReleasesAt: "2026-08-10T08:00:00.000Z",
        startedAt: "2026-08-09T08:00:00.000Z",
      },
    });
    expect(mocks.writeAudit).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "project.migration_hold.enable" }),
      expect.anything(),
    );
  });

  it("returns the same configured TTL used by the release worker", async () => {
    vi.stubEnv("BISIBILITY_MIGRATION_HOLD_TTL_HOURS", "12");

    await expect(startSelfHostMigration({ projectId })).resolves.toMatchObject({
      migration: { autoReleasesAt: "2026-08-10T00:00:00.000Z" },
    });
  });

  it("repairs a legacy hold with no timestamp before exporting", async () => {
    const malformed = { ...activeProject, writeMode: "migration_hold" };
    const repaired = {
      ...malformed,
      writeModeChangedAt: now,
      writeModeChangedById: "user_1",
    };
    mocks.requireProjectScope.mockResolvedValue(malformed);
    mocks.prisma.project.findUniqueOrThrow.mockResolvedValue(malformed);
    mocks.prisma.project.updateManyAndReturn.mockResolvedValue([repaired]);

    await expect(startSelfHostMigration({ projectId })).resolves.toMatchObject({
      migration: {
        autoReleasesAt: "2026-08-10T12:00:00.000Z",
        startedAt: "2026-08-09T12:00:00.000Z",
      },
    });
    expect(mocks.prisma.project.updateManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { writeModeChangedAt: now, writeModeChangedById: "user_1" },
        where: {
          id: "project_1",
          writeMode: "migration_hold",
          writeModeChangedAt: null,
        },
      }),
    );
  });

  it("leaves a failed export held so the explicit rollback remains available", async () => {
    mocks.exportPackage.mockRejectedValue(new Error("Package export failed."));

    await expect(startSelfHostMigration({ projectId })).rejects.toThrow("Package export failed.");
    expect(mocks.prisma.project.updateManyAndReturn).toHaveBeenCalledOnce();
    expect(mocks.prisma.project.updateManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ writeMode: "migration_hold" }) }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "project.migration_hold.enable" }),
      mocks.prisma,
    );
    expect(mocks.writeAudit).toHaveBeenCalledOnce();
    expect(mocks.writeAudit).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "project.self_host_migration.start" }),
    );
  });

  it("rejects a migrated project without exporting or replacing its terminal state", async () => {
    mocks.prisma.project.updateManyAndReturn.mockResolvedValue([]);
    mocks.prisma.project.findUniqueOrThrow.mockResolvedValue({
      ...activeProject,
      writeMode: "migrated",
    });

    await expect(startSelfHostMigration({ projectId })).rejects.toThrow(
      "Reactivate the project before starting a new migration.",
    );
    expect(mocks.exportPackage).not.toHaveBeenCalled();
  });

  it("fails closed outside hosted deployments after authorization", async () => {
    mocks.deploymentMode.mockReturnValue("self-host");

    await expect(startSelfHostMigration({ projectId })).rejects.toThrow(
      "Move to self-host is available only on hosted deployments.",
    );
    expect(mocks.requireProjectScope).toHaveBeenCalledOnce();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.exportPackage).not.toHaveBeenCalled();
  });

  it("stops when manage authorization fails", async () => {
    mocks.requireProjectScope.mockRejectedValue(new Error("You are not authorized."));

    await expect(startSelfHostMigration({ projectId })).rejects.toThrow("not authorized");
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.exportPackage).not.toHaveBeenCalled();
  });

  it("rejects a non-exact project ID before authorization", async () => {
    await expect(startSelfHostMigration({ projectId: "project_1" })).rejects.toThrow(
      "Expected a strict prj_ v3 public ID.",
    );
    expect(mocks.getActionActor).not.toHaveBeenCalled();
    expect(mocks.requireProjectScope).not.toHaveBeenCalled();
  });

  it("rolls an active migration hold back to writable mode with an audit", async () => {
    const held = { ...activeProject, writeMode: "migration_hold", writeModeChangedAt: now };
    mocks.requireProjectScope.mockResolvedValue(held);
    mocks.prisma.project.findUniqueOrThrow.mockResolvedValue(held);
    mocks.prisma.project.updateManyAndReturn.mockResolvedValue([
      { ...held, writeMode: "active", writeModeChangedAt: now },
    ]);

    await expect(rollbackSelfHostMigration({ projectId })).resolves.toEqual({
      autoReleasesAt: null,
      canRollback: false,
      startedAt: null,
      writeMode: "active",
    });
    expect(mocks.prisma.project.updateManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ writeMode: "active", writeModeChangedById: "user_1" }),
        where: { id: "project_1", writeMode: "migration_hold" },
      }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "project.self_host_migration.rollback" }),
      mocks.prisma,
    );
    expect(mocks.revalidateSettingsViews).toHaveBeenCalledOnce();
  });

  it("treats an already auto-released project as an idempotent rollback", async () => {
    mocks.prisma.project.findUniqueOrThrow.mockResolvedValue(activeProject);

    await expect(rollbackSelfHostMigration({ projectId })).resolves.toEqual({
      autoReleasesAt: null,
      canRollback: false,
      startedAt: null,
      writeMode: "active",
    });
    expect(mocks.prisma.project.updateManyAndReturn).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });
});
