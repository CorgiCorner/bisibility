import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBacklinksPageContext } from "./backlinks";

const mocks = vi.hoisted(() => ({
  cost: vi.fn(),
  prisma: {
    backlinkSnapshot: { findMany: vi.fn() },
    providerConnection: { findMany: vi.fn() },
  },
  project: {
    domain: "example.com",
    id: "project_1",
    name: "Example",
    publicId: "prj_1",
  },
  requireReadableProject: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));
vi.mock("./cost-calculator", () => ({ getProjectCostContext: mocks.cost }));

describe("backlinks page context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireReadableProject.mockResolvedValue({ project: mocks.project });
    mocks.cost.mockResolvedValue({ capCents: 5000, spentCents: 125 });
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      { provider: "dataforseo", status: "connected" },
    ]);
    mocks.prisma.backlinkSnapshot.findMany.mockResolvedValue([
      {
        expiresAt: new Date("2026-07-25T15:00:00.000Z"),
        fetchedAt: new Date("2026-07-24T15:00:00.000Z"),
        fetchedRowCount: 500,
        includeSubdomains: true,
        target: "example.com",
        targetScope: "site",
      },
      {
        expiresAt: new Date("2026-07-25T14:00:00.000Z"),
        fetchedAt: new Date("2026-07-24T14:00:00.000Z"),
        fetchedRowCount: 100,
        includeSubdomains: false,
        target: "https://example.com/pricing",
        targetScope: "page",
      },
    ]);
  });

  it("returns the five newest distinct target keys with cost and project defaults", async () => {
    await expect(getBacklinksPageContext("prj_1")).resolves.toEqual({
      costContext: { capCents: 5000, spentCents: 125 },
      defaultTarget: "example.com",
      providerStatus: "connected",
      supportingProviders: ["DataForSEO"],
      providers: [{ label: "DataForSEO", value: "dataforseo" }],
      recentTargets: [
        {
          cachedUntil: "2026-07-25T15:00:00.000Z",
          fetchedAt: "2026-07-24T15:00:00.000Z",
          includeSubdomains: true,
          provider: "unknown",
          resultLimit: 500,
          target: "example.com",
          targetScope: "site",
        },
        {
          cachedUntil: "2026-07-25T14:00:00.000Z",
          fetchedAt: "2026-07-24T14:00:00.000Z",
          includeSubdomains: false,
          provider: "unknown",
          resultLimit: 100,
          target: "https://example.com/pricing",
          targetScope: "page",
        },
      ],
    });
    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_1");
    expect(mocks.cost).toHaveBeenCalledWith("prj_1");
    expect(mocks.prisma.backlinkSnapshot.findMany).toHaveBeenCalledWith({
      orderBy: { fetchedAt: "desc" },
      select: {
        expiresAt: true,
        fetchedAt: true,
        fetchedRowCount: true,
        includeSubdomains: true,
        summary: true,
        target: true,
        targetScope: true,
      },
      take: 50,
      where: { projectId: "project_1" },
    });
  });

  it("offers only connected providers with the complete backlinks capability", async () => {
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      { provider: "serpapi", status: "connected" },
      { provider: "dataforseo", status: "needs_reauth" },
      { provider: "unregistered", status: "connected" },
    ]);
    await expect(getBacklinksPageContext("prj_1")).resolves.toMatchObject({
      providerStatus: "needs_reauth",
      providers: [],
    });
  });

  it("keeps identical recent targets from different sources separate", async () => {
    const base = {
      expiresAt: new Date("2026-07-25T15:00:00Z"),
      fetchedAt: new Date("2026-07-24T15:00:00Z"),
      fetchedRowCount: 100,
      includeSubdomains: true,
      target: "example.com",
      targetScope: "site",
    };
    mocks.prisma.backlinkSnapshot.findMany.mockResolvedValue([
      { ...base, summary: { _provider: "fixture_a" } },
      { ...base, summary: { _provider: "fixture_b" } },
      { ...base, summary: { _provider: "fixture_a" } },
    ]);
    const result = await getBacklinksPageContext("prj_1");
    expect(result.recentTargets.map((target) => target.provider)).toEqual([
      "fixture_a",
      "fixture_b",
    ]);
  });
  it("projects only validated retained original payment into recent rows without current-route guessing", async () => {
    const rows = await mocks.prisma.backlinkSnapshot.findMany();
    const payment = {
      actionId: "original",
      quoteId: null,
      state: "settled",
      option: {
        id: "option",
        connectionId: "conn_a00000000000000000000000",
        providerId: "historic-provider",
        providerLabel: "Historical provider",
        fundingSource: "byok",
        payableUnit: { kind: "currency", code: "USD" },
      },
      charge: { value: "0.03", unit: { kind: "currency", code: "USD" }, certainty: "measured" },
    };
    mocks.prisma.backlinkSnapshot.findMany.mockResolvedValue([
      { ...rows[0], summary: { _provider: "historic-provider", _payment: payment } },
      { ...rows[1], summary: { _payment: { ...payment, quoteToken: "forbidden" } } },
    ]);
    const result = await getBacklinksPageContext("prj_1");
    expect(result.recentTargets[0]).toMatchObject({ originalPayment: payment });
    expect(result.recentTargets[1]).not.toHaveProperty("originalPayment");
    expect(result.recentTargets[0]).not.toHaveProperty("payment");
  });
});
