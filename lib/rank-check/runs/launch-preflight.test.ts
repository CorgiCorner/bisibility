import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  allocation: vi.fn(),
  budget: vi.fn(),
  quote: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/execution-extension", () => ({
  deploymentRankUsesNativeUnits: async () => false,
  hostedRankCheckEstimatedCostCents: async () => null,
  quoteDeploymentRankReservations: mocks.quote,
}));
vi.mock("@/lib/rank-check/budget", () => ({
  assertBudgetAvailable: mocks.budget,
  isBudgetExhaustedError: () => false,
}));
vi.mock("@/lib/provider-usage/enforcement", () => ({
  assertProviderAllocationAvailable: mocks.allocation,
  ProviderAllocationExhaustedError: class AllocationExhausted extends Error {},
}));

import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import { estimatedRankCheckCostCents } from "@/lib/rank-check/default-cost";
import { assertLaunchBudget, estimateRunRows } from "./launch-preflight";

describe("estimateRunRows", () => {
  it("ignores a tiny own manual override when the connection is hosted", async () => {
    const depth = 10;
    const expected = estimatedRankCheckCostCents(
      "dataforseo",
      depth,
      null,
      LIST_PROVIDER_RATE_CONTEXT,
    );
    const rows = [{ id: "keyword_1" }] as Parameters<typeof estimateRunRows>[0];
    const connection = {
      costPerCheckCents: 0.0001,
      credentialSource: "hosted",
      id: "connection_1",
      provider: "dataforseo",
      rateContext: { entries: [], manualAmountCents: 0.0001 },
    } as Parameters<typeof estimateRunRows>[3];
    const result = await estimateRunRows(rows, depth, {}, connection);
    expect(expected).toBeGreaterThan(0.0001);
    expect(result.targets[0].cost).toBe(expected);
    expect(result.native.quantity).toBe(expected);
  });

  it("uses exact request quotes for each target and its native allocation", async () => {
    const rows = [{ id: "plain" }, { id: "operator" }] as Parameters<typeof estimateRunRows>[0];
    const connection = {
      credentialSource: "own",
      provider: "dataforseo",
      rateContext: { entries: [], manualAmountCents: null },
    } as Parameters<typeof estimateRunRows>[3];
    const result = await estimateRunRows(rows, 10, {}, connection, [0.2, 1]);
    expect(result.targets.map((target) => target.cost)).toEqual([0.2, 1]);
    expect(result.costCents).toBe(1.2);
    expect(result.native.quantity).toBe(1.2);
  });
});

describe("assertLaunchBudget", () => {
  const client = { $queryRaw: vi.fn() };
  const input = { project: { id: "project_1" }, origin: { source: "app" } };
  const estimate = {
    costCents: 2,
    targets: [{ keywordId: "keyword_1", cost: 2, depth: 10 }],
  };

  it("checks a hosted launch against the customer charge and skips allocation", async () => {
    mocks.quote.mockResolvedValue({ prices: { keyword_1: "1.5000" } });
    mocks.budget.mockResolvedValue({ capCents: 100, spentCents: 0 });
    await assertLaunchBudget(
      input as never,
      { credentialSource: "hosted", id: "connection_1", provider: "serpapi" } as never,
      estimate as never,
      new Date("2026-10-01T00:00:00.000Z"),
      client as never,
    );
    expect(mocks.budget).toHaveBeenCalledWith(
      "project_1",
      expect.any(Date),
      expect.objectContaining({
        estimatedCostCents: 2,
        estimatedCustomerCents: 1.5,
        funding: "platform",
      }),
    );
    expect(mocks.allocation).not.toHaveBeenCalled();
  });

  it("keeps a your-key launch on the provider cost and its allocation preflight", async () => {
    mocks.budget.mockResolvedValue({ capCents: 100, spentCents: 0 });
    await assertLaunchBudget(
      input as never,
      { credentialSource: "own", id: "connection_1", provider: "dataforseo" } as never,
      estimate as never,
      new Date("2026-10-01T00:00:00.000Z"),
      client as never,
    );
    expect(mocks.budget.mock.calls.at(-1)?.[2]).toMatchObject({
      estimatedCostCents: 2,
      funding: "byok",
    });
    expect(mocks.budget.mock.calls.at(-1)?.[2]).not.toHaveProperty("estimatedCustomerCents");
    expect(mocks.allocation).toHaveBeenCalled();
  });

  it("skips a hosted launch that has no positive provider cost to quote", async () => {
    mocks.budget.mockClear();
    mocks.quote.mockClear();
    await assertLaunchBudget(
      input as never,
      { credentialSource: "hosted", id: "connection_1", provider: "serpapi" } as never,
      { costCents: 0, targets: [{ keywordId: "keyword_1", cost: 0, depth: 10 }] } as never,
      new Date("2026-10-01T00:00:00.000Z"),
      client as never,
    );
    expect(mocks.budget).not.toHaveBeenCalled();
    expect(mocks.quote).not.toHaveBeenCalled();
  });
});
