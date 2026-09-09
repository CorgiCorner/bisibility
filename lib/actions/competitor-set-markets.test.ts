import { beforeEach, describe, expect, it, vi } from "vitest";
import { replaceCompetitorMarkets } from "./competitor-set";

const competitorPublicId = "cmp_abcdefghijklmnopqrstuvwx";
const projectPublicId = "prj_abcdefghijklmnopqrstuvwx";
const activeMarketPublicId = "pmkt_abcdefghijklmnopqrstuvwx";
const pausedMarketPublicId = "pmkt_bbcdefghijklmnopqrstuvwx";
const otherMarketPublicId = "pmkt_cdefghijklmnopqrstuvwxyz";
const removedMarketPublicId = "pmkt_defghijklmnopqrstuvwxyza";

const mocks = vi.hoisted(() => {
  let overrides: Array<{
    competitorId: string;
    mode: "added" | "excluded";
    projectMarketId: string;
  }> = [];
  let scopePolicy: "all_markets" | "selected_markets" = "all_markets";
  const markets = [
    {
      id: "market_active",
      projectId: "project_1",
      publicId: "pmkt_abcdefghijklmnopqrstuvwx",
      status: "active",
    },
    {
      id: "market_paused",
      projectId: "project_1",
      publicId: "pmkt_bbcdefghijklmnopqrstuvwx",
      status: "paused",
    },
    {
      id: "market_other",
      projectId: "project_other",
      publicId: "pmkt_cdefghijklmnopqrstuvwxyz",
      status: "active",
    },
    {
      id: "market_removed",
      projectId: "project_1",
      publicId: "pmkt_defghijklmnopqrstuvwxyza",
      status: "removed",
    },
  ];
  const competitor = () => ({
    aliases: [],
    domain: "competitor.example.com",
    evidence: null,
    id: "competitor_1",
    label: null,
    publicId: competitorPublicId,
    scopePolicy,
    source: "manual",
  });
  const prisma = {
    $transaction: vi.fn(),
    competitor: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    competitorMarketOverride: { createMany: vi.fn(), deleteMany: vi.fn() },
    project: { findFirst: vi.fn() },
    projectMarket: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
  };
  prisma.$transaction.mockImplementation((callback) => callback(prisma));
  prisma.competitor.findFirst.mockImplementation(() => Promise.resolve(competitor()));
  prisma.competitor.findMany.mockImplementation((args) => {
    const marketId = args.select?.marketOverrides?.where?.projectMarketId;
    return Promise.resolve([
      {
        ...competitor(),
        marketOverrides: overrides.filter((row) => row.projectMarketId === marketId),
      },
    ]);
  });
  prisma.competitor.update.mockImplementation(({ data }) => {
    scopePolicy = data.scopePolicy;
    return Promise.resolve(competitor());
  });
  prisma.competitorMarketOverride.deleteMany.mockImplementation(() => {
    overrides = [];
    return Promise.resolve({ count: 1 });
  });
  prisma.competitorMarketOverride.createMany.mockImplementation(({ data }) => {
    overrides = data;
    return Promise.resolve({ count: data.length });
  });
  prisma.projectMarket.findMany.mockImplementation(({ where }) =>
    Promise.resolve(
      markets.filter(
        (market) =>
          (!where.projectId || market.projectId === where.projectId) &&
          where.publicId.in.includes(market.publicId) &&
          where.status.in.includes(market.status),
      ),
    ),
  );
  return {
    prisma,
    revalidatePath: vi.fn(),
    requireSession: vi.fn(),
    reset: () => {
      overrides = [];
      scopePolicy = "all_markets";
    },
    writeAudit: vi.fn(),
  };
});

vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.writeAudit,
}));
vi.mock("@/lib/auth/authorize", () => ({ authorize: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/competitors/suggestions", () => ({ getCompetitorSuggestions: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.reset();
  mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
  mocks.prisma.user.findUnique.mockResolvedValue({
    memberships: [{ projectId: "project_1", role: "member" }],
    role: "member",
  });
  mocks.prisma.project.findFirst.mockResolvedValue({
    id: "project_1",
    ownerId: "user_1",
    publicId: projectPublicId,
  });
  mocks.writeAudit.mockResolvedValue({});
});

describe("competitor market replacement", () => {
  it("replaces all-market exclusions and selected-market additions atomically", async () => {
    await replaceCompetitorMarkets({
      competitorId: competitorPublicId,
      marketIds: [activeMarketPublicId],
      projectId: projectPublicId,
      scopePolicy: "all_markets",
    });

    expect(mocks.prisma.competitorMarketOverride.createMany).toHaveBeenLastCalledWith({
      data: [{ competitorId: "competitor_1", mode: "excluded", projectMarketId: "market_active" }],
    });
    expect(mocks.prisma.competitor.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { scopePolicy: "all_markets" } }),
    );

    await replaceCompetitorMarkets({
      competitorId: competitorPublicId,
      marketIds: [activeMarketPublicId],
      projectId: projectPublicId,
      scopePolicy: "selected_markets",
    });

    expect(mocks.prisma.competitorMarketOverride.createMany).toHaveBeenLastCalledWith({
      data: [{ competitorId: "competitor_1", mode: "added", projectMarketId: "market_active" }],
    });
    expect(mocks.prisma.competitor.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { scopePolicy: "selected_markets" } }),
    );
    expect(mocks.writeAudit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "competitor.market_membership.replace",
        targetType: "competitor",
      }),
      mocks.prisma,
    );
  });

  it("accepts a paused market, which still belongs to the project", async () => {
    await replaceCompetitorMarkets({
      competitorId: competitorPublicId,
      marketIds: [pausedMarketPublicId],
      projectId: projectPublicId,
      scopePolicy: "selected_markets",
    });

    expect(mocks.prisma.competitorMarketOverride.createMany).toHaveBeenLastCalledWith({
      data: [{ competitorId: "competitor_1", mode: "added", projectMarketId: "market_paused" }],
    });
  });

  it("rejects removed, cross-project, malformed, and duplicate market references before mutation", async () => {
    for (const marketIds of [
      [removedMarketPublicId],
      [otherMarketPublicId],
      ["market_database_1"],
      [activeMarketPublicId, activeMarketPublicId],
    ]) {
      await expect(
        replaceCompetitorMarkets({
          competitorId: competitorPublicId,
          marketIds,
          projectId: projectPublicId,
          scopePolicy: "all_markets",
        }),
      ).rejects.toThrow();
    }

    expect(mocks.prisma.competitorMarketOverride.deleteMany).not.toHaveBeenCalled();
    expect(mocks.prisma.competitorMarketOverride.createMany).not.toHaveBeenCalled();
    expect(mocks.prisma.competitor.update).not.toHaveBeenCalled();
  });
});
