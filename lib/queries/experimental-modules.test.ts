import { beforeEach, describe, expect, it, vi } from "vitest";
import { getExperimentalModules } from "./experimental-modules";

const mocks = vi.hoisted(() => ({
  prisma: { projectDefaults: { findUnique: vi.fn() } },
  requireReadableProject: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));

describe("getExperimentalModules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireReadableProject.mockResolvedValue({ project: { id: "project_1" } });
  });

  it("returns no modules when the project has no defaults record", async () => {
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue(null);

    await expect(getExperimentalModules("prj_abcdefghijklmnopqrstuvwx")).resolves.toEqual([]);
    expect(mocks.prisma.projectDefaults.findUnique).toHaveBeenCalledWith({
      select: { enabledExperimentalModules: true },
      where: { projectId: "project_1" },
    });
  });

  it("normalizes unknown stored module values", async () => {
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue({
      enabledExperimentalModules: ["unknown", "competitors"],
    });

    await expect(getExperimentalModules("prj_abcdefghijklmnopqrstuvwx")).resolves.toEqual([
      "competitors",
    ]);
  });
});
