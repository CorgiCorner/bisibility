import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadLatestSuccessfulChecks } from "./keyword-check-state";
import { listKeywords } from "./keywords";

const mocks = vi.hoisted(() => ({
  keywordFindMany: vi.fn(),
  rankCheckFindMany: vi.fn(),
  rankCheckGroupBy: vi.fn(),
  resolveLocation: vi.fn(),
  writeAudit: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    keyword: { findMany: mocks.keywordFindMany },
    rankCheck: { findMany: mocks.rankCheckFindMany, groupBy: mocks.rankCheckGroupBy },
  },
}));
vi.mock("@/lib/actions/keyword-helpers", () => ({ addTags: vi.fn() }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/serp/location-service", () => ({ resolveKeywordLocation: mocks.resolveLocation }));

function keywordRow(index: number) {
  return {
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    device: "desktop",
    id: `keyword_${index + 1}`,
    intent: null,
    location: "United States",
    locationRef: {
      canonicalKey: "US",
      languageCode: "en",
      languageLabel: "English",
    },
    project: { defaults: null },
    publicId: `kw_a${String(index).padStart(23, "0")}`,
    rankChecks: [],
    schedule: null,
    tags: [],
    targetUrl: null,
    text: `rank tracker ${index}`,
    topic: null,
    updatedAt: new Date("2026-09-02T00:00:00.000Z"),
  };
}

function context(query = "") {
  return {
    auth: { project: { id: "project_1", publicId: "prj_a00000000000000000000000" } },
    headers: new Headers(),
    req: new Request(`https://example.com/api/keywords${query}`),
    url: new URL(`https://example.com/api/keywords${query}`),
  } as never;
}

describe("loadLatestSuccessfulChecks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips the query entirely for an empty keyword page", async () => {
    const result = await loadLatestSuccessfulChecks([]);

    expect(result.size).toBe(0);
    expect(mocks.rankCheckGroupBy).not.toHaveBeenCalled();
    expect(mocks.rankCheckFindMany).not.toHaveBeenCalled();
  });

  it("loads one latest completed check per keyword via a bounded pair of queries", async () => {
    const row = {
      checkedAt: new Date("2026-09-04T00:00:00.000Z"),
      keywordId: "keyword_1",
      position: 6,
      publicId: "check_a00000000000000000000000",
      rankingUrl: "https://example.com/rank-tracker",
      run: { publicId: "rcr_a00000000000000000000000" },
    };
    mocks.rankCheckGroupBy.mockResolvedValue([
      { _max: { checkedAt: row.checkedAt }, keywordId: "keyword_1" },
    ]);
    mocks.rankCheckFindMany.mockResolvedValue([row]);

    const result = await loadLatestSuccessfulChecks(["keyword_1", "keyword_2"]);

    expect(mocks.rankCheckGroupBy).toHaveBeenCalledTimes(1);
    expect(mocks.rankCheckGroupBy).toHaveBeenCalledWith({
      _max: { checkedAt: true },
      by: ["keywordId"],
      where: { status: "completed", keywordId: { in: ["keyword_1", "keyword_2"] } },
    });
    expect(mocks.rankCheckFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.rankCheckFindMany).toHaveBeenCalledWith({
      select: {
        checkedAt: true,
        keywordId: true,
        position: true,
        publicId: true,
        rankingUrl: true,
        run: { select: { publicId: true } },
      },
      where: {
        OR: [{ keywordId: "keyword_1", checkedAt: row.checkedAt }],
        status: "completed",
      },
    });
    const findManyArg = mocks.rankCheckFindMany.mock.calls[0][0];
    expect(findManyArg).not.toHaveProperty("distinct");
    expect(result.get("keyword_1")).toMatchObject({ keywordId: "keyword_1", position: 6 });
    expect(result.get("keyword_2")).toBeUndefined();
  });

  it("returns an empty map when no completed check exists", async () => {
    mocks.rankCheckGroupBy.mockResolvedValue([]);

    const result = await loadLatestSuccessfulChecks(["keyword_1"]);

    expect(result.size).toBe(0);
    expect(mocks.rankCheckFindMany).not.toHaveBeenCalled();
  });

  it("keeps only the newer of two completed checks for the same keyword", async () => {
    const older = new Date("2026-09-01T00:00:00.000Z");
    const newer = new Date("2026-09-04T00:00:00.000Z");
    const completedChecks = [
      {
        checkedAt: newer,
        keywordId: "keyword_1",
        position: 6,
        publicId: "check_a00000000000000000000000",
        rankingUrl: "https://example.com/rank-tracker",
        run: { publicId: "rcr_a00000000000000000000000" },
      },
      {
        checkedAt: older,
        keywordId: "keyword_1",
        position: 12,
        publicId: "check_b00000000000000000000000",
        rankingUrl: "https://example.com/rank-tracker",
        run: { publicId: "rcr_b00000000000000000000000" },
      },
    ];
    mocks.rankCheckGroupBy.mockResolvedValue([
      { _max: { checkedAt: newer }, keywordId: "keyword_1" },
    ]);
    mocks.rankCheckFindMany.mockImplementation(
      (arg: { where: { OR: Array<{ checkedAt: Date; keywordId: string }> } }) =>
        completedChecks.filter((candidate) =>
          arg.where.OR.some(
            (pair) =>
              pair.keywordId === candidate.keywordId &&
              pair.checkedAt.getTime() === candidate.checkedAt.getTime(),
          ),
        ),
    );

    const result = await loadLatestSuccessfulChecks(["keyword_1"]);

    expect(mocks.rankCheckGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "completed", keywordId: { in: ["keyword_1"] } } }),
    );
    expect(mocks.rankCheckFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.rankCheckFindMany).toHaveBeenCalledWith({
      select: {
        checkedAt: true,
        keywordId: true,
        position: true,
        publicId: true,
        rankingUrl: true,
        run: { select: { publicId: true } },
      },
      where: {
        OR: [{ keywordId: "keyword_1", checkedAt: newer }],
        status: "completed",
      },
    });
    const findManyArg = mocks.rankCheckFindMany.mock.calls[0][0];
    expect(findManyArg).not.toHaveProperty("distinct");
    expect(result.get("keyword_1")).toMatchObject({
      position: 6,
      publicId: "check_a00000000000000000000000",
    });
    expect(result.get("keyword_1")).not.toMatchObject({
      publicId: "check_b00000000000000000000000",
    });
    expect(result.get("keyword_1")?.checkedAt).not.toEqual(older);
  });
});

describe("keyword list check-state loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rankCheckFindMany.mockResolvedValue([]);
  });

  it("issues one bounded groupBy plus one findMany for successful checks when listing 50 keywords", async () => {
    const page = Array.from({ length: 50 }, (_unused, index) => keywordRow(index));
    mocks.keywordFindMany.mockResolvedValue(page);
    const groups = page.map((keyword, index) => ({
      _max: { checkedAt: new Date(Date.UTC(2026, 8, index + 1)) },
      keywordId: keyword.id,
    }));
    mocks.rankCheckGroupBy.mockResolvedValue(groups);

    const response = await listKeywords(context("?limit=50"), "prj_a00000000000000000000000");

    expect(response.status).toBe(200);
    expect(mocks.keywordFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.rankCheckGroupBy).toHaveBeenCalledTimes(1);
    expect(mocks.rankCheckGroupBy).toHaveBeenCalledWith({
      _max: { checkedAt: true },
      by: ["keywordId"],
      where: {
        status: "completed",
        keywordId: { in: page.map((keyword) => keyword.id) },
      },
    });
    expect(mocks.rankCheckFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.rankCheckFindMany).toHaveBeenCalledWith({
      select: {
        checkedAt: true,
        keywordId: true,
        position: true,
        publicId: true,
        rankingUrl: true,
        run: { select: { publicId: true } },
      },
      where: {
        OR: groups.map((group) => ({
          keywordId: group.keywordId,
          checkedAt: group._max.checkedAt,
        })),
        status: "completed",
      },
    });
    const findManyArg = mocks.rankCheckFindMany.mock.calls[0][0];
    expect(findManyArg).not.toHaveProperty("distinct");
  });
});
