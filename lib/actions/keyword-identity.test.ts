import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateKeyword } from "./keyword";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  resolveKeywordLocation: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: vi.fn().mockResolvedValue({ id: "user_1" }),
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
  requireKeywordScope: vi.fn().mockResolvedValue({
    id: "keyword_1",
    projectId: "project_1",
    publicId: "kw_a00000000000000000000000",
  }),
  requireProjectScope: vi.fn(),
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    keyword: { findUnique: mocks.findUnique, update: mocks.update },
    keywordTag: { deleteMany: vi.fn() },
  },
}));
vi.mock("@/lib/serp/location-service", () => ({
  resolveKeywordLocation: mocks.resolveKeywordLocation,
}));
vi.mock("./keyword-helpers", () => ({
  addTags: vi.fn(),
  consumeSavedKeywords: vi.fn(),
  createKeywordBatch: vi.fn(),
  createKeywordBatchSet: vi.fn(),
  promotedSavedKeywordPairs: vi.fn(),
  publicKeywordView: (keyword: object) => keyword,
  revalidateKeywords: vi.fn(),
}));
vi.mock("./keyword-location", () => ({
  keywordLocationResolverInput: (input: object) => input,
  resolveKeywordRows: vi.fn(),
  uniqueLocationWarnings: vi.fn(),
}));
vi.mock("./keyword-matrix", () => ({ addKeywordsMatrix: vi.fn() }));

describe("updateKeyword identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue({
      device: "desktop",
      location: "United States",
      locationId: "location_1",
      targetUrl: null,
      text: "rank tracker",
    });
    mocks.resolveKeywordLocation.mockResolvedValue({
      location: { id: "location_2" },
      warning: null,
    });
    mocks.update.mockResolvedValue({
      id: "keyword_1",
      publicId: "kw_a00000000000000000000000",
      targetUrl: null,
      text: "rank tracker",
    });
  });

  it.each([
    ["text", { keyword: "seo tracker" }],
    ["locationId", { locationKey: "US/Texas/Austin" }],
    ["device", { device: "mobile" }],
  ])("rejects a changed %s before writing", async (field, change) => {
    await expect(
      updateKeyword({ keywordId: "kw_a00000000000000000000000", ...change }),
    ).rejects.toMatchObject({ code: "conflict", field, status: 409 });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
