import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorFromUnknown } from "./error-mapper";
import { patchKeyword } from "./keywords";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  resolveKeywordLocation: vi.fn(),
  update: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/actions/keyword-helpers", () => ({ addTags: vi.fn() }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    keyword: { findFirst: mocks.findFirst, update: mocks.update },
    keywordSchedule: { upsert: vi.fn() },
    keywordTag: { deleteMany: vi.fn() },
  },
}));
vi.mock("@/lib/serp/location-service", () => ({
  resolveKeywordLocation: mocks.resolveKeywordLocation,
}));
vi.mock("./resources", () => ({
  keywordInclude: {},
  keywordResource: (stored: { publicId: string }) => ({ id: stored.publicId, type: "keyword" }),
}));

const keyword = {
  device: "desktop",
  id: "keyword_1",
  intent: null,
  location: "United States",
  locationId: "location_1",
  publicId: "kw_a00000000000000000000000",
  targetUrl: null,
  text: "rank tracker",
  topic: null,
};

function context(body: unknown) {
  return {
    auth: { project: { id: "project_1", publicId: "prj_a00000000000000000000000" } },
    headers: new Headers(),
    req: new Request("https://example.com/api/keywords", {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    }),
    url: new URL("https://example.com/api/keywords"),
  } as never;
}

async function mappedPatchResponse(body: unknown) {
  try {
    return await patchKeyword(context(body), keyword.publicId);
  } catch (error) {
    return errorFromUnknown(error, new Headers(), new URL("https://example.com/api/keywords"));
  }
}

describe("patchKeyword identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue(keyword);
    mocks.resolveKeywordLocation.mockResolvedValue({
      location: { id: "location_2" },
      warning: null,
    });
    mocks.update.mockResolvedValue(keyword);
  });

  it.each([
    ["text", { keyword: "seo tracker" }],
    ["locationId", { location_key: "US/Texas/Austin" }],
    ["device", { device: "mobile" }],
  ])("returns 409 without writing for changed %s", async (_field, body) => {
    const response = await mappedPatchResponse(body);

    expect(response.status).toBe(409);
    expect(response.status).not.toBe(500);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("accepts identical resent identity values while updating the target URL", async () => {
    mocks.update.mockResolvedValue({ ...keyword, targetUrl: "https://example.com/docs" });

    const response = await mappedPatchResponse({
      device: "desktop",
      keyword: "rank tracker",
      target_url: "https://example.com/docs",
    });

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ targetUrl: "https://example.com/docs" }),
      }),
    );
  });

  it("accepts a patch that omits every identity field", async () => {
    mocks.update.mockResolvedValue({ ...keyword, targetUrl: "https://example.org/docs" });

    const response = await mappedPatchResponse({ target_url: "https://example.org/docs" });

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledOnce();
  });
});
