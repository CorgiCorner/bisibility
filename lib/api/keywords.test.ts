import { CapacityLimitError } from "@/lib/capacity/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorFromUnknown } from "./error-mapper";
import { deleteKeyword, getKeyword, listKeywords, patchKeyword } from "./keywords";

const mocks = vi.hoisted(() => ({
  addTags: vi.fn(),
  findMembership: vi.fn(),
  prepareCapacity: vi.fn(),
  setCadence: vi.fn(),
  $transaction: vi.fn(),
  delete: vi.fn(),
  deleteMany: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  rankCheckRunUpdate: vi.fn(),
  rankCheckRunItemFindMany: vi.fn(),
  rankCheckRunItemUpdateMany: vi.fn(),
  resolveLocation: vi.fn(),
  update: vi.fn(),
  upsert: vi.fn(),
  writeAudit: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/capacity/capacity-extension", () => ({
  prepareResourceCapacity: mocks.prepareCapacity,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.$transaction,
    keyword: {
      delete: mocks.delete,
      findFirst: mocks.findFirst,
      findMany: mocks.findMany,
      update: mocks.update,
    },
    keywordSchedule: { upsert: mocks.upsert },
    keywordTag: { deleteMany: mocks.deleteMany },
    rankCheckRun: { update: mocks.rankCheckRunUpdate },
    rankCheckRunItem: {
      findMany: mocks.rankCheckRunItemFindMany,
      updateMany: mocks.rankCheckRunItemUpdateMany,
    },
  },
}));
vi.mock("@/lib/rank-check/schedules/keyword-cadence", () => ({
  setKeywordCadence: mocks.setCadence,
}));
vi.mock("@/lib/actions/keyword-helpers", () => ({ addTags: mocks.addTags }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/serp/location-service", () => ({
  resolveKeywordLocation: mocks.resolveLocation,
  resolveKeywordLocationUsingStore: mocks.resolveLocation,
}));
vi.mock("./resources", () => ({
  keywordInclude: {},
  keywordResource: (keyword: { publicId: string }) => ({ id: keyword.publicId, type: "keyword" }),
  keywordResources: async (keywords: { publicId: string }[]) =>
    keywords.map((keyword) => ({ id: keyword.publicId, type: "keyword" })),
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
    mocks.prepareCapacity.mockReset();
    mocks.prepareCapacity.mockResolvedValue({ check: vi.fn() });
    mocks.findMany.mockResolvedValue([]);
    mocks.findFirst.mockResolvedValue(null);
    mocks.findMany.mockResolvedValue([
      { id: "keyword_1", publicId: "kw_a00000000000000000000000" },
    ]);
    mocks.rankCheckRunItemFindMany.mockResolvedValue([]);
    mocks.rankCheckRunItemUpdateMany.mockResolvedValue({ count: 1 });
    mocks.rankCheckRunUpdate.mockResolvedValue({});
    mocks.$transaction.mockImplementation(
      async (callback: (tx: Record<string, unknown>) => unknown) =>
        callback({
          $queryRaw: vi.fn(),
          keyword: {
            deleteMany: mocks.delete,
            findMany: mocks.findMany,
            findUnique: mocks.findMembership,
            update: mocks.update,
          },
          keywordTag: { deleteMany: mocks.deleteMany },
          projectDefaults: { findUnique: vi.fn(async () => ({ serpDepth: 100 })) },
          providerConnection: { findFirst: vi.fn(async () => null) },
          rankCheckRun: { update: mocks.rankCheckRunUpdate },
          rankCheckRunItem: {
            findMany: mocks.rankCheckRunItemFindMany,
            updateMany: mocks.rankCheckRunItemUpdateMany,
          },
        }),
    );
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
      null,
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

  it("refuses an update that increases cadence before metadata or tag writes", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "keyword_1",
      publicId: "kw_a00000000000000000000000",
      text: "rank tracker",
      location: "United States",
      locationId: "location_1",
      device: "desktop",
    });
    mocks.findMembership.mockResolvedValue({
      checkSchedule: {
        frequency: "weekly",
        enabled: true,
        archivedAt: null,
        cronExpression: null,
        serpDepth: null,
      },
    });
    const response = await patchKeyword(
      context("", { frequency: "daily", topic: "new topic", tags: ["Core"] }),
      "kw_a00000000000000000000000",
    );
    expect(response.status).toBe(428);
    expect(await response.json()).toMatchObject({ code: "schedule_review_required" });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.addTags).not.toHaveBeenCalled();
    expect(mocks.setCadence).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  // The capacity mock covers only the outer project gate in patchKeyword
  // (prepareResourceCapacity with no dimensions). setKeywordCadence is mocked, so the
  // scheduledKeywords and scheduleFrequencies checks inside it are not exercised here.
  it.each([
    [
      "an unreviewed increase gets 428 before the outer project capacity gate runs",
      "weekly",
      "daily",
      428,
      "schedule_review_required",
      0,
    ],
    [
      "a non-increase passes review and reaches the outer project capacity gate",
      "daily",
      "weekly",
      403,
      "plan_limit_reached",
      1,
    ],
  ])("%s (%s to %s)", async (_label, before, frequency, status, code, capacityCalls) => {
    mocks.findFirst.mockResolvedValue({
      id: "keyword_1",
      publicId: "kw_a00000000000000000000000",
      text: "rank tracker",
      location: "United States",
      locationId: "location_1",
      device: "desktop",
    });
    mocks.findMembership.mockResolvedValue({
      checkSchedule: {
        frequency: before,
        enabled: true,
        archivedAt: null,
        cronExpression: null,
        serpDepth: null,
      },
    });
    const capacityError = new CapacityLimitError({
      dimension: "scheduledKeywords",
      limit: 0,
      used: 1,
      requested: 0,
      scope: "project",
    });
    mocks.prepareCapacity.mockRejectedValue(capacityError);
    const ctx = context("", { frequency, topic: "new topic", tags: ["Core"] });
    const response = await patchKeyword(ctx, "kw_a00000000000000000000000").catch((error) =>
      errorFromUnknown(error, new Headers(), new URL("https://example.com/api/keywords")),
    );
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ code });
    expect(mocks.prepareCapacity).toHaveBeenCalledTimes(capacityCalls);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.addTags).not.toHaveBeenCalled();
    expect(mocks.setCadence).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("returns not-found responses for get, patch, and delete", async () => {
    expect((await getKeyword(context(), "missing")).status).toBe(404);
    expect((await patchKeyword(context("", {}), "missing")).status).toBe(404);
    expect((await deleteKeyword(context(), "missing")).status).toBe(404);
  });

  it("uses the active-run deletion guard for a single keyword", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "keyword_1",
      publicId: "kw_a00000000000000000000000",
      text: "rank tracker",
    });
    mocks.rankCheckRunItemFindMany.mockResolvedValue([
      {
        id: "item_1",
        keywordId: "keyword_1",
        rankCheckId: "rank_1",
        run: { publicId: "rcr_a00000000000000000000000" },
        runId: "run_1",
        status: "running",
      },
    ]);

    await expect(deleteKeyword(context(), "kw_a00000000000000000000000")).rejects.toThrow(
      "Run rcr_a00000000000000000000000 is still checking 1 keyword.",
    );

    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("resolves a patched city and country and refreshes the resource", async () => {
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
      projectId: "project_1",
      selection: { cityName: "Austin", countryCode: "US", kind: "city" },
    });
    expect(mocks.deleteMany).toHaveBeenCalled();
    expect(mocks.addTags).toHaveBeenCalled();
  });

  it("prefers a canonical location key when patching", async () => {
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
