import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  budgetStatus: vi.fn(),
  chain: vi.fn(),
  defaults: vi.fn(),
  keywordCount: vi.fn(),
  keywordFindMany: vi.fn(),
  monthlySpend: vi.fn().mockResolvedValue(120),
  projectMarket: { findMany: vi.fn().mockResolvedValue([{ locationId: "loc_active" }]) },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    keyword: { count: mocks.keywordCount, findMany: mocks.keywordFindMany },
    projectDefaults: { findUnique: mocks.defaults },
    projectMarket: mocks.projectMarket,
    providerConnection: { findFirst: vi.fn().mockResolvedValue(null) },
  },
}));
vi.mock("@/lib/metering/project-budget-read", () => ({
  projectBudgetCapCents: vi.fn(),
  projectBudgetStatus: mocks.budgetStatus,
}));
vi.mock("@/lib/metering/usage-read", () => ({ monthlySpendCents: mocks.monthlySpend }));
vi.mock("@/lib/rank-check/provider-chain-loader", () => ({
  loadSerpProviderChain: mocks.chain,
}));

import { prisma } from "@/lib/db/prisma";
import { buildFirstCheckRunPlan } from "./first-check-run-plan";

function readyKeyword(id: string, overrides: Record<string, unknown> = {}) {
  return {
    checkSchedule: null,
    device: "desktop",
    id,
    location: "loc_active",
    locationRef: {
      canonicalKey: "US",
      cityName: null,
      countryCode: "US",
      displayName: "United States",
      kind: "country",
    },
    rankChecks: [],
    schedule: null,
    ...overrides,
  };
}

describe("first-check run plan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.budgetStatus.mockResolvedValue({
      budget: { limit: { value: 5000n, scale: 0, unit: "budget_cents" } },
      reserved: { value: 0n, scale: 0, unit: "budget_cents" },
      uncertain: false,
    });
    mocks.monthlySpend.mockResolvedValue(120);
    mocks.defaults.mockResolvedValue({ serpDepth: 100 });
    mocks.keywordCount.mockResolvedValue(2);
  });

  it("estimates upper-bound operations at each target's effective depth for a quota provider", async () => {
    mocks.chain.mockResolvedValue([{ costPerCheckCents: null, provider: "serpapi" }]);
    mocks.keywordFindMany.mockResolvedValue([
      readyKeyword("kw_plain"),
      readyKeyword("kw_scheduled", { checkSchedule: { serpDepth: 20 } }),
      readyKeyword("kw_checked", { rankChecks: [{ id: "rc_1" }] }),
    ]);

    const plan = await buildFirstCheckRunPlan("prj_1");

    expect(plan.nativeEstimate).toEqual({
      providerId: "serpapi",
      quantity: 12,
      unit: "units",
      unknownTargets: 0,
    });
    expect(plan.firstTargetEstimate).toMatchObject({ quantity: 10, unit: "units" });
    expect(plan.readyCount).toBe(2);
  });

  it("scopes targets to non-archived, unchecked, runnable keywords in active markets", async () => {
    mocks.chain.mockResolvedValue([{ costPerCheckCents: null, provider: "serpapi" }]);
    mocks.keywordFindMany.mockResolvedValue([]);

    await buildFirstCheckRunPlan("prj_1");

    const runnableWhere = {
      archivedAt: null,
      locationId: { in: ["loc_active"] },
      projectId: "prj_1",
    };
    expect(mocks.keywordCount).toHaveBeenCalledWith({
      where: { ...runnableWhere, rankChecks: { none: { status: "completed" } } },
    });
    expect(mocks.keywordFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: runnableWhere }),
    );
  });

  it("keeps an unavailable provider unknown instead of inheriting a plan price", async () => {
    mocks.chain.mockResolvedValue([{ costPerCheckCents: null, provider: "unrecognized" }]);
    mocks.keywordFindMany.mockResolvedValue([readyKeyword("kw_plain")]);

    const plan = await buildFirstCheckRunPlan("prj_1");

    expect(plan.nativeEstimate).toEqual({
      providerId: "unrecognized",
      quantity: null,
      unit: null,
      unknownTargets: 1,
    });
    expect(plan.firstTargetEstimate).toMatchObject({ quantity: null, unknownTargets: 1 });
  });

  it("keeps combined monthly spend for an unsplit project and the funding budget once split", async () => {
    mocks.chain.mockResolvedValue([{ costPerCheckCents: null, provider: "serpapi" }]);
    mocks.keywordFindMany.mockResolvedValue([]);
    mocks.budgetStatus.mockResolvedValue({
      budget: { limit: { value: 500n, scale: 0, unit: "budget_cents" } },
      used: { value: 30n, scale: 0, unit: "budget_cents" },
      reserved: { value: 0n, scale: 0, unit: "budget_cents" },
      uncertain: false,
    });

    expect((await buildFirstCheckRunPlan("prj_1")).budget).toEqual({
      capCents: 500,
      spentCents: 120,
    });

    vi.mocked(prisma.providerConnection.findFirst).mockResolvedValueOnce({
      credentialSource: "own",
      id: "connection_1",
      provider: "dataforseo",
      rates: [],
    } as never);
    mocks.budgetStatus.mockResolvedValue({
      budget: {
        id: "own-project:prj_1:monthly",
        limit: { value: 100n, scale: 0, unit: "budget_cents" },
      },
      used: { value: 30n, scale: 0, unit: "budget_cents" },
      reserved: { value: 10n, scale: 0, unit: "budget_cents" },
      uncertain: false,
    });

    const split = await buildFirstCheckRunPlan("prj_1");
    expect(split.budget).toEqual({ capCents: 100, spentCents: 30 });
    expect(split.budgetExhausted).toBe(false);
  });
});

it("first-check advisory includes outstanding Store reservations and uncertainty", async () => {
  mocks.chain.mockResolvedValue([{ costPerCheckCents: null, provider: "serpapi" }]);
  mocks.keywordFindMany.mockResolvedValue([]);
  mocks.budgetStatus.mockResolvedValue({
    budget: { limit: { value: 5000n, scale: 0, unit: "budget_cents" } },
    reserved: { value: 5000n, scale: 0, unit: "budget_cents" },
    uncertain: false,
  });
  expect((await buildFirstCheckRunPlan("project")).budgetExhausted).toBe(true);
  mocks.budgetStatus.mockResolvedValue({
    budget: { limit: null },
    reserved: { value: 0n, scale: 0, unit: "budget_cents" },
    uncertain: true,
  });
  expect((await buildFirstCheckRunPlan("project")).budgetExhausted).toBe(true);
});
