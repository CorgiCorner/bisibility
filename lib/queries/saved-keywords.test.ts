import { beforeEach, describe, expect, it, vi } from "vitest";
import { listSavedKeywords, savedKeywordCount } from "./saved-keywords";

const mocks = vi.hoisted(() => ({
  prisma: {
    savedKeyword: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
  project: { id: "project_1", publicId: "prj_1" },
  requireReadableProject: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));

describe("saved keyword queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireReadableProject.mockResolvedValue({ project: mocks.project });
    mocks.prisma.savedKeyword.count.mockResolvedValue(0);
    mocks.prisma.savedKeyword.findMany.mockResolvedValue([]);
  });

  it("lists authorized project rows by volume descending and returns the total", async () => {
    mocks.prisma.savedKeyword.count.mockResolvedValueOnce(2);
    mocks.prisma.savedKeyword.findMany.mockResolvedValueOnce([
      {
        countryCode: "US",
        cpc: 1.25,
        difficulty: 42,
        intent: "commercial",
        languageCode: "en",
        location: "US",
        publicId: "skw_1",
        savedAt: new Date("2026-07-24T14:00:00.000Z"),
        sourceSeed: "seo tools",
        text: "rank tracker",
        trend: [{ month: 6, searchVolume: 900, year: 2026 }],
        variantCount: 2,
        volume: 1_200,
      },
    ]);

    await expect(listSavedKeywords("prj_1")).resolves.toEqual({
      rows: [
        expect.objectContaining({
          publicId: "skw_1",
          savedAt: "2026-07-24T14:00:00.000Z",
          volume: 1_200,
        }),
      ],
      total: 2,
    });
    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_1");
    expect(mocks.prisma.savedKeyword.findMany).toHaveBeenCalledWith({
      orderBy: [{ volume: { nulls: "last", sort: "desc" } }, { savedAt: "desc" }, { id: "desc" }],
      select: expect.objectContaining({
        publicId: true,
        savedAt: true,
        text: true,
        volume: true,
      }),
      where: { projectId: "project_1" },
    });
    expect(mocks.prisma.savedKeyword.count).toHaveBeenCalledWith({
      where: { projectId: "project_1" },
    });
  });

  it("counts rows after resolving readable project scope", async () => {
    mocks.prisma.savedKeyword.count.mockResolvedValueOnce(7);

    await expect(savedKeywordCount("prj_1")).resolves.toBe(7);

    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_1");
    expect(mocks.prisma.savedKeyword.count).toHaveBeenCalledWith({
      where: { projectId: "project_1" },
    });
  });
});
