import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  listProjectMarkets: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { competitor: { findMany: mocks.findMany } },
}));
vi.mock("@/lib/markets/registry", () => ({
  listProjectMarkets: mocks.listProjectMarkets,
}));

import { CompetitorMarketNotFoundError, effectiveCompetitors } from "./effective";

const projectId = "project_1";
const markets = [
  { id: "market_flanders", status: "active" },
  { id: "market_wallonia", status: "paused" },
];

const competitors = [
  {
    aliases: ["Alpha"],
    domain: "alpha.example.com",
    evidence: { reason: "shared keywords" },
    id: "competitor_database_alpha",
    label: "Alpha",
    publicId: "cmp_alphaaaaaaaaaaaaaaaaaaaa",
    scopePolicy: "all_markets",
    source: "manual",
  },
  {
    aliases: [],
    domain: "bravo.example.com",
    evidence: null,
    id: "competitor_database_bravo",
    label: null,
    publicId: "cmp_bravoooooooooooooooooooo",
    scopePolicy: "all_markets",
    source: "suggested",
  },
  {
    aliases: ["Selected"],
    domain: "selected.example.org",
    evidence: { score: 12 },
    id: "competitor_database_selected",
    label: "Selected",
    publicId: "cmp_selectedddddddddddddddddd",
    scopePolicy: "selected_markets",
    source: "suggested",
  },
];

function overrideFor(competitor: (typeof competitors)[number], marketId: string | undefined) {
  if (!marketId) return [];
  if (competitor.domain === "bravo.example.com" && marketId === "market_flanders") {
    return [{ mode: "excluded" }];
  }
  if (competitor.domain === "selected.example.org" && marketId === "market_flanders") {
    return [{ mode: "added" }];
  }
  return [];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listProjectMarkets.mockResolvedValue(markets);
  mocks.findMany.mockImplementation((args) => {
    const marketId = (
      args as { select?: { marketOverrides?: { where?: { projectMarketId?: string } } } }
    ).select?.marketOverrides?.where?.projectMarketId;
    return Promise.resolve(
      competitors.map((competitor) => ({
        ...competitor,
        marketOverrides: overrideFor(competitor, marketId),
      })),
    );
  });
});

describe("effective competitors", () => {
  it("applies all-markets exclusions and selected-markets additions per visible market", async () => {
    await expect(effectiveCompetitors(projectId, "market_flanders")).resolves.toMatchObject([
      { domain: "alpha.example.com" },
      { domain: "selected.example.org" },
    ]);
    await expect(effectiveCompetitors(projectId, "market_wallonia")).resolves.toMatchObject([
      { domain: "alpha.example.com" },
      { domain: "bravo.example.com" },
    ]);
  });

  it("keeps every project competitor in the intentional project-level result", async () => {
    await expect(effectiveCompetitors(projectId, null)).resolves.toMatchObject([
      { domain: "alpha.example.com" },
      { domain: "bravo.example.com" },
      { domain: "selected.example.org" },
    ]);
  });

  it("returns persisted contract fields in domain-first order without database identities", async () => {
    const result = await effectiveCompetitors(projectId, "market_wallonia");

    expect(result).toEqual([
      {
        aliases: ["Alpha"],
        domain: "alpha.example.com",
        evidence: { reason: "shared keywords" },
        id: "cmp_alphaaaaaaaaaaaaaaaaaaaa",
        label: "Alpha",
        scopePolicy: "all_markets",
        source: "manual",
      },
      {
        aliases: [],
        domain: "bravo.example.com",
        evidence: null,
        id: "cmp_bravoooooooooooooooooooo",
        label: null,
        scopePolicy: "all_markets",
        source: "suggested",
      },
    ]);
    expect(result.every(({ id }) => id.startsWith("cmp_"))).toBe(true);
    expect(result.flatMap((row) => Object.values(row))).not.toContain("competitor_database_alpha");
    expect(mocks.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        orderBy: [{ domain: "asc" }, { publicId: "asc" }],
        select: expect.not.objectContaining({ id: true }),
      }),
    );
  });

  it("takes the typed not-found path for archived and other-project market IDs", async () => {
    await expect(effectiveCompetitors(projectId, "market_archived")).rejects.toBeInstanceOf(
      CompetitorMarketNotFoundError,
    );
    await expect(effectiveCompetitors(projectId, "market_other_project")).rejects.toBeInstanceOf(
      CompetitorMarketNotFoundError,
    );
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
