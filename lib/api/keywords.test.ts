import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteKeyword, getKeyword, listKeywords, patchKeyword } from "./keywords";

const mocks = vi.hoisted(() => ({
  addTags: vi.fn(),
  deleteMany: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  resolveLocation: vi.fn(),
  update: vi.fn(),
  upsert: vi.fn(),
  writeAudit: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    keyword: { findFirst: mocks.findFirst, findMany: mocks.findMany, update: mocks.update },
    keywordSchedule: { upsert: mocks.upsert },
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

function context(query = "", body?: unknown) {
  return {
    auth: {
      project: { id: "project_1", publicId: "prj_a00000000000000000000000" },
    },
    headers: new Headers(),
    req: new Request(`https://example.com/api/keywords${query}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: body === undefined ? "GET" : "PATCH",
    }),
    url: new URL(`https://example.com/api/keywords${query}`),
  } as never;
}

describe("keyword API list filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([]);
    mocks.findFirst.mockResolvedValue(null);
    mocks.resolveLocation.mockResolvedValue({
      location: {
        countryCode: "US",
        displayName: "Austin, Texas, United States",
        id: "location_1",
        languageCode: "en",
        languageLabel: "English",
      },
    });
  });

  it("rejects invalid devices, numbers, and metadata", async () => {
    await expect(
      listKeywords(context("?device=tablet"), "prj_a00000000000000000000000"),
    ).rejects.toThrow("device must be desktop or mobile");
    await expect(
      listKeywords(context("?position_gt=nope"), "prj_a00000000000000000000000"),
    ).rejects.toThrow("filter[position_gt] must be a number");
    await expect(
      listKeywords(context(`?topic=${"x".repeat(81)}`), "prj_a00000000000000000000000"),
    ).rejects.toThrow("topic must be a non-empty string");
  });

  it("serializes the resolved market key and language on keyword resources", async () => {
    const { keywordResource } = await vi.importActual<typeof import("./resources")>("./resources");
    const resource = keywordResource(
      {
        createdAt: new Date("2026-08-14T00:00:00.000Z"),
        device: "desktop",
        id: "keyword_1",
        intent: null,
        location: "Malaga, Andalusia, Spain (English)",
        locationRef: {
          canonicalKey: "ES/Andalusia/Malaga@en",
          languageCode: "en",
          languageLabel: "English",
        },
        project: { defaults: null },
        publicId: "kw_a00000000000000000000000",
        rankChecks: [],
        schedule: null,
        tags: [],
        targetUrl: null,
        text: "rank tracker",
        topic: null,
        updatedAt: new Date("2026-08-14T00:00:00.000Z"),
      } as never,
      "prj_a00000000000000000000000",
    );

    expect(resource).toMatchObject({
      language_code: "en",
      language_label: "English",
      location_key: "ES/Andalusia/Malaga@en",
    });
  });

  it("builds alternate-name filters, market aliases, and ascending sort", async () => {
    await listKeywords(
      context(
        "?device=mobile&country=US&q=rank&tag=Core&topic=Product&intent=commercial&position_gt=3&position_lt=20&sort=updated_at",
      ),
      "prj_a00000000000000000000000",
    );
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ updatedAt: "asc" }, { publicId: "asc" }],
        skip: 0,
        where: expect.objectContaining({
          AND: expect.any(Array),
          device: "mobile",
          intent: { equals: "commercial", mode: "insensitive" },
          rankChecks: { some: { position: { gt: 3, lt: 20 } } },
          tags: expect.any(Object),
          text: { contains: "rank", mode: "insensitive" },
          topic: { equals: "Product", mode: "insensitive" },
        }),
      }),
    );
  });

  it("uses keyword sorting and forbids a mismatched project", async () => {
    await listKeywords(context("?sort=-keyword"), "prj_a00000000000000000000000");
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ text: "desc" }, { publicId: "desc" }],
        skip: 0,
      }),
    );
    const response = await listKeywords(context(), "other_project");
    expect(response.status).toBe(403);
  });

  it("uses keyset pages only for default descending creation order", async () => {
    const first = {
      createdAt: new Date("2026-07-27T12:00:00.000Z"),
      publicId: "kw_a00000000000000000000000",
    };
    const second = {
      createdAt: new Date("2026-07-27T11:00:00.000Z"),
      publicId: "kw_b00000000000000000000000",
    };
    mocks.findMany.mockResolvedValueOnce([first, second]).mockResolvedValueOnce([second]);

    const firstResponse = await listKeywords(context("?limit=1"), "prj_a00000000000000000000000");
    const firstBody = await firstResponse.json();
    const cursor = firstBody.meta.next_cursor as string;
    const secondResponse = await listKeywords(
      context(`?limit=1&cursor=${cursor}`),
      "prj_a00000000000000000000000",
    );

    expect((await secondResponse.json()).data).toEqual([
      { id: "kw_b00000000000000000000000", type: "keyword" },
    ]);
    expect(mocks.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        skip: undefined,
        where: expect.objectContaining({
          OR: [
            { createdAt: { lt: new Date("2026-07-27T12:00:00.000Z") } },
            {
              createdAt: new Date("2026-07-27T12:00:00.000Z"),
              publicId: { lt: "kw_a00000000000000000000000" },
            },
          ],
        }),
      }),
    );
  });

  it.each(["created_at", "keyword", "-keyword", "text", "-text", "updated_at", "-updated_at"])(
    "uses strict offset pages for non-default sort %s",
    async (sort) => {
      const first = {
        createdAt: new Date("2026-07-27T11:00:00.000Z"),
        publicId: "kw_a00000000000000000000000",
      };
      const second = {
        createdAt: new Date("2026-07-27T12:00:00.000Z"),
        publicId: "kw_b00000000000000000000000",
      };
      mocks.findMany.mockResolvedValueOnce([first, second]).mockResolvedValueOnce([second]);

      const firstResponse = await listKeywords(
        context(`?limit=1&sort=${sort}`),
        "prj_a00000000000000000000000",
      );
      const cursor = (await firstResponse.json()).meta.next_cursor as string;
      await listKeywords(
        context(`?limit=1&sort=${sort}&cursor=${cursor}`),
        "prj_a00000000000000000000000",
      );

      expect(mocks.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 1 }));
      await expect(
        listKeywords(
          context(
            `?limit=1&sort=${sort}&cursor=${Buffer.from(
              JSON.stringify({
                public_id: "kw_a00000000000000000000000",
                t: "2026-07-27T11:00:00.000Z",
                v: 2,
              }),
            ).toString("base64url")}`,
          ),
          "prj_a00000000000000000000000",
        ),
      ).rejects.toThrow("Cursor must be a valid v3 cursor");
    },
  );

  it("returns not-found responses for get, patch, and delete", async () => {
    expect((await getKeyword(context(), "missing")).status).toBe(404);
    expect((await patchKeyword(context("", {}), "missing")).status).toBe(404);
    expect((await deleteKeyword(context(), "missing")).status).toBe(404);
  });

  it("resolves a patched city and country and refreshes the resource", async () => {
    const keyword = {
      id: "keyword_1",
      intent: null,
      location: "United States",
      publicId: "kw_a00000000000000000000000",
      targetUrl: null,
      topic: null,
    };
    mocks.findFirst.mockResolvedValue(keyword);
    mocks.update.mockResolvedValue(keyword);
    const response = await patchKeyword(
      context("", {
        city: "Austin",
        keyword: "rank tracker",
        location: "United States",
        tags: ["Core"],
      }),
      "kw_a00000000000000000000000",
    );
    expect(response.status).toBe(200);
    expect(mocks.resolveLocation).toHaveBeenCalledWith({
      city: "Austin",
      country: "United States",
      projectId: "project_1",
    });
    expect(mocks.deleteMany).toHaveBeenCalled();
    expect(mocks.addTags).toHaveBeenCalled();
  });

  it("prefers a canonical location key when patching", async () => {
    const keyword = {
      id: "keyword_1",
      intent: null,
      location: "United States",
      publicId: "kw_a00000000000000000000000",
      targetUrl: null,
      topic: null,
    };
    mocks.findFirst.mockResolvedValue(keyword);
    mocks.update.mockResolvedValue(keyword);
    await patchKeyword(
      context("", { keyword: "rank tracker", location_key: "US/Texas/Austin" }),
      "kw_a00000000000000000000000",
    );
    expect(mocks.resolveLocation).toHaveBeenCalledWith({
      projectId: "project_1",
      selection: { canonicalKey: "US/Texas/Austin", kind: "city" },
    });
  });
});
