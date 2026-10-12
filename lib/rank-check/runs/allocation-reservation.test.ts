import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock("@/lib/provider-usage/enforcement", () => ({
  assertProviderAllocationAvailable: mocks.check,
}));

import { reserveProviderAllocation } from "./launch-preflight";

it.each(["app", "programmatic"] as const)(
  "consults Store headroom for %s without workflow pseudo reservations",
  async (surface) => {
    const tx = { $queryRaw: vi.fn(), rankCheckRun: { findMany: vi.fn() } };
    mocks.check.mockResolvedValue({ mode: "allocation", remaining: 1, unit: "units" });
    await reserveProviderAllocation(tx as never, {
      connection: { id: "connection", provider: "serpapi" },
      estimatedCostCents: 1,
      estimatedUsageQuantity: 1,
      projectId: "project",
      surface,
      now: new Date(),
    });
    expect(mocks.check).toHaveBeenCalledWith(expect.objectContaining({ surface }), tx);
    expect(tx.rankCheckRun.findMany).not.toHaveBeenCalled();
  },
);
