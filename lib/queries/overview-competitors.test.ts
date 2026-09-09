import { beforeEach, describe, expect, it, vi } from "vitest";
import { getKeywordCompetitors } from "./competitor-policies";
import { getOverviewCompetitors } from "./overview-competitors";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  competitor: vi.fn(),
  keywords: vi.fn(),
  keyword: vi.fn(),
  checks: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.auth }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    competitor: { findMany: mocks.competitor },
    keyword: { findMany: mocks.keywords, findFirst: mocks.keyword },
    rankCheck: { findMany: mocks.checks },
  },
}));
const filters = {
  device: "mobile" as const,
  marketIds: ["us"],
  range: "7d" as const,
  tag: "Product",
};
const now = new Date("2026-09-08T12:00:00Z");
const competitor = {
  publicId: "cmp_1",
  domain: "rival.test",
  label: "Rival",
  scopePolicy: "all_markets",
  marketOverrides: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ project: { id: "internal-project" } });
  mocks.competitor.mockResolvedValue([competitor]);
  mocks.keywords.mockResolvedValue([
    {
      locationId: "us",
      rankChecks: [
        {
          id: "check1",
          position: 5,
          organicRanks: [{ domain: "rival.test", position: 2 }],
          degradedToCountry: false,
        },
      ],
    },
  ]);
  mocks.keyword.mockResolvedValue({ locationId: "us" });
  mocks.checks.mockResolvedValue([]);
});

describe("competitor context queries", () => {
  it("authorizes and applies every dashboard filter before choosing the latest completed check", async () => {
    const data = await getOverviewCompetitors("prj_public", filters, now);
    expect(mocks.auth).toHaveBeenCalledWith("prj_public");
    expect(mocks.competitor.mock.calls[0][0].where).toEqual({ projectId: "internal-project" });
    expect(mocks.keywords.mock.calls[0][0]).toMatchObject({
      take: 2001,
      where: {
        projectId: "internal-project",
        device: "mobile",
        locationId: { in: ["us"] },
        tags: { some: { tag: { name: "Product" } } },
        locationRef: {
          projectMarkets: { some: { projectId: "internal-project", status: "active" } },
        },
      },
      select: {
        rankChecks: {
          take: 1,
          where: {
            status: "completed",
            checkedAt: { gte: new Date("2026-09-02T00:00:00Z"), lte: now },
          },
        },
      },
    });
    expect(data?.rows[0]).toMatchObject({ above: 1, paired: 1, found: 1 });
    expect(mocks.checks).not.toHaveBeenCalled();
  });

  it("does not query SERPs when there are no configured competitors", async () => {
    mocks.competitor.mockResolvedValue([]);
    expect(await getOverviewCompetitors("prj_public", filters, now)).toBeNull();
    expect(mocks.keywords).not.toHaveBeenCalled();
  });

  it("loads legacy payloads only for exact selected checks in the authorized project", async () => {
    mocks.keywords.mockResolvedValue([
      { locationId: "us", rankChecks: [{ id: "legacy", position: 5, organicRanks: null }] },
    ]);
    mocks.checks.mockResolvedValue([
      { id: "legacy", raw: { organic_results: [{ domain: "rival.test", rank: 2 }] } },
    ]);
    const data = await getOverviewCompetitors("prj_public", filters, now);
    expect(mocks.checks.mock.calls[0][0].where).toEqual({
      id: { in: ["legacy"] },
      keyword: { projectId: "internal-project" },
      status: "completed",
    });
    expect(data?.rows[0].above).toBe(1);
  });

  it("does not compare a country fallback as if it were a city result", async () => {
    mocks.keywords.mockResolvedValue([
      {
        locationId: "us",
        rankChecks: [
          {
            id: "fallback",
            position: 5,
            organicRanks: [{ domain: "rival.test", position: 2 }],
            degradedToCountry: true,
          },
        ],
      },
    ]);
    expect((await getOverviewCompetitors("prj_public", filters, now))?.rows[0]).toMatchObject({
      checked: 0,
      above: 0,
      paired: 0,
    });
  });

  it("filters keyword competitors by the keyword's actual market without exposing policy internals", async () => {
    mocks.competitor.mockResolvedValue([
      competitor,
      { ...competitor, domain: "excluded.test", scopePolicy: "selected_markets" },
    ]);
    expect(await getKeywordCompetitors("prj_public", "kw_public")).toEqual([
      { publicId: "cmp_1", domain: "rival.test", label: "Rival" },
    ]);
    expect(mocks.keyword).toHaveBeenCalledWith({
      where: { projectId: "internal-project", publicId: "kw_public" },
      select: { locationId: true },
    });
  });

  it("never loads competitors or SERPs after authorization fails", async () => {
    mocks.auth.mockRejectedValue(new Error("Denied"));
    await expect(getOverviewCompetitors("other-project", filters, now)).rejects.toThrow("Denied");
    expect(mocks.competitor).not.toHaveBeenCalled();
    expect(mocks.keywords).not.toHaveBeenCalled();
  });
});
