import { beforeEach, describe, expect, it, vi } from "vitest";
import { removeSavedKeywords, saveKeywords } from "./saved-keyword";

const mocks = vi.hoisted(() => ({
  actor: { id: "user_1" },
  getActionActor: vi.fn(),
  makePublicId: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    keyword: {
      findMany: vi.fn(),
    },
    savedKeyword: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
  },
  project: { id: "project_1", publicId: "prj_a00000000000000000000000" },
  requireProjectScope: vi.fn(),
  revalidatePath: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.writeAudit,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./_shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./_shared")>()),
  getActionActor: mocks.getActionActor,
  makePublicId: mocks.makePublicId,
  requireProjectScope: mocks.requireProjectScope,
}));

describe("saved keyword actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActionActor.mockResolvedValue(mocks.actor);
    mocks.makePublicId
      .mockReturnValueOnce("svkw_a00000000000000000000000")
      .mockReturnValueOnce("svkw_b00000000000000000000000")
      .mockReturnValue("skw_next");
    mocks.requireProjectScope.mockResolvedValue(mocks.project);
    mocks.prisma.$transaction.mockImplementation((callback: (tx: typeof mocks.prisma) => unknown) =>
      callback(mocks.prisma),
    );
    mocks.prisma.savedKeyword.createMany.mockResolvedValue({ count: 1 });
    mocks.prisma.savedKeyword.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.savedKeyword.findMany.mockResolvedValue([
      { publicId: "svkw_a00000000000000000000000" },
    ]);
    mocks.prisma.keyword.findMany.mockResolvedValue([]);
    mocks.writeAudit.mockResolvedValue({});
  });

  it("saves snapshots and counts a duplicate keyword and location", async () => {
    await expect(
      saveKeywords({
        projectId: "prj_a00000000000000000000000",
        rows: [
          {
            cpcCents: 125,
            difficulty: 42,
            intent: "commercial",
            keyword: "  Rank   Tracker ",
            location: "US",
            monthlyTrend: [{ month: 6, searchVolume: 900, year: 2026 }],
            searchVolume: 1_200,
            sourceSeed: "seo tools",
            variantCount: 2,
          },
          {
            cpcCents: 125,
            difficulty: 42,
            intent: "commercial",
            keyword: "rank tracker",
            location: "US",
            monthlyTrend: [{ month: 6, searchVolume: 900, year: 2026 }],
            searchVolume: 1_200,
            sourceSeed: "seo tools",
            variantCount: 2,
          },
        ],
      }),
    ).resolves.toEqual({
      created: [{ keyword: "Rank Tracker", publicId: "svkw_a00000000000000000000000" }],
      duplicateCount: 1,
      savedCount: 1,
    });

    expect(mocks.requireProjectScope).toHaveBeenCalledWith(
      mocks.actor,
      "create",
      "prj_a00000000000000000000000",
      {
        type: "keyword",
      },
    );
    expect(mocks.prisma.savedKeyword.createMany).toHaveBeenCalledWith({
      data: [
        {
          cpc: 1.25,
          difficulty: 42,
          intent: "commercial",
          location: "US",
          normalizedText: "rank tracker",
          projectId: "project_1",
          publicId: "svkw_a00000000000000000000000",
          sourceSeed: "seo tools",
          text: "Rank Tracker",
          trend: [{ month: 6, searchVolume: 900, year: 2026 }],
          variantCount: 2,
          volume: 1_200,
        },
        expect.objectContaining({
          normalizedText: "rank tracker",
          projectId: "project_1",
          publicId: "svkw_b00000000000000000000000",
        }),
      ],
      skipDuplicates: true,
    });
    expect(mocks.prisma.savedKeyword.findMany).toHaveBeenCalledWith({
      select: { publicId: true },
      where: {
        projectId: "project_1",
        publicId: { in: ["svkw_a00000000000000000000000", "svkw_b00000000000000000000000"] },
      },
    });
  });

  it("does not write when project permission is denied", async () => {
    mocks.requireProjectScope.mockRejectedValueOnce(new Error("forbidden"));

    await expect(
      saveKeywords({
        projectId: "prj_a00000000000000000000000",
        rows: [{ keyword: "rank tracker", location: "US" }],
      }),
    ).rejects.toThrow("forbidden");

    expect(mocks.prisma.savedKeyword.createMany).not.toHaveBeenCalled();
  });

  it("atomically skips a snapshot that is already tracked at write time", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValueOnce([{ text: " Rank   Tracker " }]);
    mocks.prisma.savedKeyword.findMany.mockResolvedValueOnce([
      { publicId: "svkw_b00000000000000000000000" },
    ]);

    await expect(
      saveKeywords({
        projectId: "prj_a00000000000000000000000",
        rows: [
          { keyword: "Rank Tracker", location: "US" },
          { keyword: "Fresh Idea", location: "US" },
        ],
      }),
    ).resolves.toEqual({
      created: [{ keyword: "Fresh Idea", publicId: "svkw_b00000000000000000000000" }],
      duplicateCount: 1,
      savedCount: 1,
    });

    expect(mocks.prisma.keyword.findMany).toHaveBeenCalledWith({
      select: { text: true },
      where: { projectId: "project_1" },
    });
    expect(mocks.prisma.savedKeyword.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          normalizedText: "fresh idea",
          publicId: "svkw_b00000000000000000000000",
        }),
      ],
      skipDuplicates: true,
    });
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });

  it("removes only the requested public ids from the authorized project", async () => {
    mocks.prisma.savedKeyword.deleteMany.mockResolvedValueOnce({ count: 2 });

    await expect(
      removeSavedKeywords({
        projectId: "prj_a00000000000000000000000",
        publicIds: ["svkw_a00000000000000000000000", "svkw_c00000000000000000000000"],
      }),
    ).resolves.toEqual({ removedCount: 2 });

    expect(mocks.requireProjectScope).toHaveBeenCalledWith(
      mocks.actor,
      "delete",
      "prj_a00000000000000000000000",
      {
        type: "keyword",
      },
    );
    expect(mocks.prisma.savedKeyword.deleteMany).toHaveBeenCalledWith({
      where: {
        projectId: "project_1",
        publicId: { in: ["svkw_a00000000000000000000000", "svkw_c00000000000000000000000"] },
      },
    });
  });

  it("removes one research snapshot by normalized keyword and location", async () => {
    mocks.prisma.savedKeyword.deleteMany.mockResolvedValueOnce({ count: 1 });

    await expect(
      removeSavedKeywords({
        projectId: "prj_a00000000000000000000000",
        rows: [{ keyword: "  Rank   Tracker ", location: "US" }],
      }),
    ).resolves.toEqual({ removedCount: 1 });

    expect(mocks.prisma.savedKeyword.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [{ location: "US", normalizedText: "rank tracker" }],
        projectId: "project_1",
      },
    });
  });
});
