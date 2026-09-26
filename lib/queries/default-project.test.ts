import { beforeEach, describe, expect, it, vi } from "vitest";
import { findDefaultProjectCandidate, persistDefaultProject } from "./default-project";

const mocks = vi.hoisted(() => ({
  prisma: {
    project: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const target = { id: "project_1", publicId: "prj_abcdefghijklmnopqrstuvwx" };

describe("default project persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.user.findUnique.mockResolvedValue({
      defaultProject: null,
      publicId: "usr_abcdefghijklmnopqrstuvwx",
    });
  });

  it("loads the candidate by public ID with its onboarding state", async () => {
    await findDefaultProjectCandidate(target.publicId);

    expect(mocks.prisma.project.findUnique).toHaveBeenCalledWith({
      select: { id: true, onboardingCompletedAt: true, publicId: true },
      where: { publicId: target.publicId },
    });
  });

  it("writes the internal project ID and reports the previous public ID", async () => {
    await expect(persistDefaultProject("user_1", target)).resolves.toEqual({
      changed: true,
      previousProjectId: null,
      publicId: "usr_abcdefghijklmnopqrstuvwx",
    });

    expect(mocks.prisma.user.update).toHaveBeenCalledWith({
      data: { defaultProjectId: "project_1" },
      where: { id: "user_1" },
    });
  });

  it("clears the column", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      defaultProject: { publicId: target.publicId },
      publicId: "usr_abcdefghijklmnopqrstuvwx",
    });

    await expect(persistDefaultProject("user_1", null)).resolves.toMatchObject({
      changed: true,
      previousProjectId: target.publicId,
    });
    expect(mocks.prisma.user.update).toHaveBeenCalledWith({
      data: { defaultProjectId: null },
      where: { id: "user_1" },
    });
  });

  it("does not write when nothing changes", async () => {
    await expect(persistDefaultProject("user_1", null)).resolves.toMatchObject({ changed: false });
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });
});
