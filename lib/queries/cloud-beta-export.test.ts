import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLatestCloudPackageExport } from "./cloud-beta-export";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  requireReadableProject: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { auditLog: { findFirst: mocks.findFirst } },
}));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));

describe("latest Cloud package export query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireReadableProject.mockResolvedValue({ project: { id: "project_1" } });
  });

  it("returns a serialisable summary from the latest successful package export", async () => {
    mocks.findFirst.mockResolvedValue({
      after: { count: 248 },
      createdAt: new Date("2026-07-19T12:00:00.000Z"),
    });

    await expect(getLatestCloudPackageExport("prj_1")).resolves.toEqual({
      exportedAt: "2026-07-19T12:00:00.000Z",
    });
    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_1");
    expect(mocks.findFirst).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
      where: {
        action: "cloud_import.export_package",
        projectId: "project_1",
        status: "success",
      },
    });
  });

  it("keeps the export date when a historical audit row has a zero count", async () => {
    mocks.findFirst.mockResolvedValue({
      after: { count: 0 },
      createdAt: new Date("2026-07-19T12:00:00.000Z"),
    });

    await expect(getLatestCloudPackageExport("project_1")).resolves.toEqual({
      exportedAt: "2026-07-19T12:00:00.000Z",
    });
  });

  it("returns null when the workspace has never exported a package", async () => {
    mocks.findFirst.mockResolvedValue(null);

    await expect(getLatestCloudPackageExport("project_1")).resolves.toBeNull();
  });

  it("keeps the export date when a legacy audit row has a malformed count", async () => {
    mocks.findFirst.mockResolvedValue({
      after: { count: "unknown" },
      createdAt: new Date("2026-07-19T12:00:00.000Z"),
    });

    await expect(getLatestCloudPackageExport("project_1")).resolves.toEqual({
      exportedAt: "2026-07-19T12:00:00.000Z",
    });
  });
});
