import { beforeEach, describe, expect, it, vi } from "vitest";
import { listKeywords, patchKeyword } from "./keywords";

const mocks = vi.hoisted(() => ({
  addTags: vi.fn(),
  deleteMany: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  resolveLocation: vi.fn(),
  update: vi.fn(),
  writeAudit: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    keyword: { findFirst: mocks.findFirst, findMany: mocks.findMany, update: mocks.update },
    keywordTag: { deleteMany: mocks.deleteMany },
  },
}));
vi.mock("@/lib/actions/keyword-helpers", () => ({ addTags: mocks.addTags }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/serp/location-service", () => ({ resolveKeywordLocation: mocks.resolveLocation }));
vi.mock("./resources", () => ({
  keywordInclude: {},
  keywordResource: (keyword: { publicId: string }) => ({ id: keyword.publicId, type: "keyword" }),
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

function context(query = "", body?: unknown) {
  return {
    auth: { project: { id: "project_1", publicId: "prj_a00000000000000000000000" } },
    headers: new Headers(),
    req: new Request(`https://example.com/api/keywords${query}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: body === undefined ? "GET" : "PATCH",
    }),
    url: new URL(`https://example.com/api/keywords${query}`),
  } as never;
}

describe("keyword patch and list legacy market contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue(keyword);
    mocks.findMany.mockResolvedValue([]);
    mocks.update.mockResolvedValue(keyword);
    mocks.resolveLocation.mockResolvedValue({
      degraded: false,
      location: {
        canonicalKey: "US",
        countryCode: "US",
        displayName: "United States",
        id: "location_1",
        languageCode: "en",
        languageLabel: "English",
      },
      warning: null,
    });
  });

  it.each([
    ["country name", { country: "United States" }, { location_key: "US" }],
    ["location alias", { location: "usa" }, { location_key: "US" }],
  ])(
    "patches identically for the legacy %s shape and the location_key shape",
    async (_label, legacy, modern) => {
      const old = await patchKeyword(
        context("", { keyword: "rank tracker", ...legacy }),
        keyword.publicId,
      );
      const oldResolution = mocks.resolveLocation.mock.calls[0]?.[0];
      const oldUpdate = mocks.update.mock.calls[0]?.[0];
      vi.clearAllMocks();
      mocks.findFirst.mockResolvedValue(keyword);
      mocks.update.mockResolvedValue(keyword);
      mocks.resolveLocation.mockResolvedValue({
        degraded: false,
        location: {
          canonicalKey: "US",
          countryCode: "US",
          displayName: "United States",
          id: "location_1",
          languageCode: "en",
          languageLabel: "English",
        },
        warning: null,
      });

      const fresh = await patchKeyword(
        context("", { keyword: "rank tracker", ...modern }),
        keyword.publicId,
      );

      expect(old.status).toBe(200);
      expect(fresh.status).toBe(200);
      expect(oldResolution).toEqual({
        projectId: "project_1",
        selection: { canonicalKey: modern.location_key, kind: "city" },
      });
      expect(mocks.resolveLocation.mock.calls[0]?.[0]).toEqual(oldResolution);
      expect(mocks.update.mock.calls[0]?.[0]).toEqual(oldUpdate);
      expect(oldUpdate).toMatchObject({
        data: { location: "United States", locationId: "location_1" },
      });
    },
  );

  it("filters the keyword list by an exact canonical location key", async () => {
    await listKeywords(context("?location_key=ES"), "prj_a00000000000000000000000");
    await listKeywords(
      context("?filter[location_key]=ES/Andalusia/Malaga@es"),
      "prj_a00000000000000000000000",
    );

    expect(mocks.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { locationRef: { canonicalKey: "ES" }, projectId: "project_1" },
    });
    expect(mocks.findMany.mock.calls[1]?.[0]).toMatchObject({
      where: { locationRef: { canonicalKey: "ES/Andalusia/Malaga" }, projectId: "project_1" },
    });
  });

  it("keeps the deprecated country filter and rejects malformed location keys", async () => {
    await listKeywords(context("?country=usa"), "prj_a00000000000000000000000");

    expect(mocks.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        AND: [
          {
            OR: expect.arrayContaining([
              { location: { equals: "United States", mode: "insensitive" } },
              { location: { equals: "usa", mode: "insensitive" } },
            ]),
          },
        ],
      },
    });
    await expect(
      listKeywords(context("?location_key=US/Texas/Austin/Extra"), "prj_a00000000000000000000000"),
    ).rejects.toThrow("location_key must be a canonical location key");
  });
});
