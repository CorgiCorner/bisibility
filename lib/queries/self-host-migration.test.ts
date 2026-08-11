import { getSelfHostMigrationState } from "@/lib/queries/self-host-migration";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deploymentMode: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  requireReadableProject: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { project: { findUniqueOrThrow: mocks.findUniqueOrThrow } },
}));
vi.mock("@/lib/deployment/deployment", () => ({ deploymentMode: mocks.deploymentMode }));
vi.mock("@/lib/queries/_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));

describe("self-host migration state query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deploymentMode.mockReturnValue("cloud");
    mocks.requireReadableProject.mockResolvedValue({ project: { id: "project_1" } });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the persisted hold and exact auto-release timestamp", async () => {
    mocks.findUniqueOrThrow.mockResolvedValue({
      writeMode: "migration_hold",
      writeModeChangedAt: new Date("2026-08-09T12:00:00.000Z"),
    });

    await expect(getSelfHostMigrationState("prj_abcdefghijklmnopqrstuvwx")).resolves.toEqual({
      autoReleasesAt: "2026-08-10T12:00:00.000Z",
      canRollback: true,
      startedAt: "2026-08-09T12:00:00.000Z",
      writeMode: "migration_hold",
    });
    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_abcdefghijklmnopqrstuvwx");
    expect(mocks.findUniqueOrThrow).toHaveBeenCalledWith({
      select: { writeMode: true, writeModeChangedAt: true },
      where: { id: "project_1" },
    });
  });

  it("does not invent a release timestamp for a malformed legacy hold", async () => {
    mocks.findUniqueOrThrow.mockResolvedValue({
      writeMode: "migration_hold",
      writeModeChangedAt: null,
    });

    await expect(getSelfHostMigrationState("prj_abcdefghijklmnopqrstuvwx")).resolves.toEqual({
      autoReleasesAt: null,
      canRollback: true,
      startedAt: null,
      writeMode: "migration_hold",
    });
  });

  it("uses the configured worker TTL for the eligibility timestamp", async () => {
    vi.stubEnv("BISIBILITY_MIGRATION_HOLD_TTL_HOURS", "12");
    mocks.findUniqueOrThrow.mockResolvedValue({
      writeMode: "migration_hold",
      writeModeChangedAt: new Date("2026-08-09T12:00:00.000Z"),
    });

    await expect(getSelfHostMigrationState("prj_abcdefghijklmnopqrstuvwx")).resolves.toMatchObject({
      autoReleasesAt: "2026-08-10T00:00:00.000Z",
    });
  });

  it("fails closed outside hosted deployments after the readable-project guard", async () => {
    mocks.deploymentMode.mockReturnValue("self-host");

    await expect(getSelfHostMigrationState("prj_abcdefghijklmnopqrstuvwx")).rejects.toThrow(
      "Move to self-host is available only on hosted deployments.",
    );
    expect(mocks.requireReadableProject).toHaveBeenCalledOnce();
    expect(mocks.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
