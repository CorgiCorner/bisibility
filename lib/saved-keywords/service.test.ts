import { beforeEach, describe, expect, it, vi } from "vitest";
import { removeSavedKeywordRows, saveSavedKeywordRows } from "./service";

const mocks = vi.hoisted(() => ({
  createMany: vi.fn(),
  deleteMany: vi.fn(),
  findManySaved: vi.fn(),
  findManyTracked: vi.fn(),
  makePublicId: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.writeAudit,
}));
vi.mock("@/lib/db/public-id", () => ({ makePublicId: mocks.makePublicId }));
vi.mock("@/lib/db/prisma", () => {
  const transaction = {
    keyword: { findMany: mocks.findManyTracked },
    savedKeyword: {
      createMany: mocks.createMany,
      deleteMany: mocks.deleteMany,
      findMany: mocks.findManySaved,
    },
  };
  return {
    prisma: {
      $transaction: (callback: (tx: unknown) => unknown) => callback(transaction),
    },
  };
});

const scope = {
  actorId: null,
  projectId: "project_1",
  projectPublicId: "prj_a00000000000000000000000",
};

describe("saved keyword service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.makePublicId
      .mockReturnValueOnce("svkw_a00000000000000000000000")
      .mockReturnValueOnce("svkw_b00000000000000000000000")
      .mockReturnValueOnce("svkw_c00000000000000000000000");
    mocks.findManyTracked.mockResolvedValue([
      { locationRef: { canonicalKey: "US" }, text: "Already tracked" },
    ]);
    mocks.createMany.mockResolvedValue({ count: 1 });
    mocks.findManySaved.mockResolvedValue([{ publicId: "svkw_b00000000000000000000000" }]);
    mocks.writeAudit.mockResolvedValue({ id: "audit_1" });
  });

  it("silently skips tracked and duplicate rows while preserving result order", async () => {
    const result = await saveSavedKeywordRows(
      [
        { keyword: "Already tracked", location: "US", variantCount: 0 },
        { keyword: "New keyword", location: "US", variantCount: 0 },
        { keyword: "New keyword", location: "US", variantCount: 0 },
      ],
      scope,
    );

    expect(mocks.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          countryCode: "US",
          languageCode: "en",
          normalizedText: "new keyword",
          publicId: "svkw_b00000000000000000000000",
        }),
        expect.objectContaining({
          normalizedText: "new keyword",
          publicId: "svkw_c00000000000000000000000",
        }),
      ],
      skipDuplicates: true,
    });
    expect(result).toMatchObject({
      duplicateCount: 2,
      results: [
        { keyword: "Already tracked", status: "skipped" },
        { keyword: "New keyword", status: "created" },
        { keyword: "New keyword", status: "skipped" },
      ],
      savedCount: 1,
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: null, projectId: "project_1" }),
    );
  });

  it("keeps the same normalized keyword distinct across language pairs", async () => {
    mocks.findManyTracked.mockResolvedValue([
      { locationRef: { canonicalKey: "ES" }, text: "Rank tracker" },
    ]);
    mocks.createMany.mockResolvedValue({ count: 1 });
    mocks.findManySaved.mockResolvedValue([{ publicId: "svkw_b00000000000000000000000" }]);

    const result = await saveSavedKeywordRows(
      [
        { keyword: "Rank tracker", location: "ES", variantCount: 0 },
        { keyword: "Rank tracker", location: "ES@en", variantCount: 0 },
      ],
      scope,
    );

    expect(mocks.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          countryCode: "ES",
          languageCode: "en",
          location: "ES@en",
          normalizedText: "rank tracker",
        }),
      ],
      skipDuplicates: true,
    });
    expect(result.results).toEqual([
      { keyword: "Rank tracker", status: "skipped" },
      { keyword: "Rank tracker", status: "created" },
    ]);
  });

  it("round trips a default-language alias through its canonical saved location", async () => {
    mocks.findManyTracked.mockResolvedValue([]);
    mocks.findManySaved.mockResolvedValue([{ publicId: "svkw_a00000000000000000000000" }]);
    mocks.deleteMany.mockResolvedValue({ count: 1 });

    await saveSavedKeywordRows(
      [{ keyword: "Rank tracker", location: "ES@es", variantCount: 0 }],
      scope,
    );
    await expect(
      removeSavedKeywordRows({ rows: [{ keyword: "  RANK tracker ", location: "ES@es" }] }, scope),
    ).resolves.toEqual({ removedCount: 1 });

    expect(mocks.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          countryCode: "ES",
          languageCode: "es",
          location: "ES",
          normalizedText: "rank tracker",
        }),
      ],
      skipDuplicates: true,
    });
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [{ location: "ES", normalizedText: "rank tracker" }],
        projectId: "project_1",
      },
    });
  });

  it("deletes only saved keywords inside the authenticated project", async () => {
    mocks.deleteMany.mockResolvedValue({ count: 1 });

    await expect(
      removeSavedKeywordRows({ publicIds: ["svkw_a00000000000000000000000"] }, scope),
    ).resolves.toEqual({ removedCount: 1 });

    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: {
        projectId: "project_1",
        publicId: { in: ["svkw_a00000000000000000000000"] },
      },
    });
  });
});
