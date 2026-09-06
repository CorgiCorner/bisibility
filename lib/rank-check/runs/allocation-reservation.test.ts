import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ assertAllocation: vi.fn() }));
const { AllocationExhaustedError } = vi.hoisted(() => ({
  AllocationExhaustedError: class extends Error {},
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/provider-usage/enforcement", () => ({
  assertProviderAllocationAvailable: mocks.assertAllocation,
  ProviderAllocationExhaustedError: AllocationExhaustedError,
}));

import { providerAllocationReservation, reserveProviderAllocation } from "./launch-preflight";

describe("rank-check provider allocation reservations", () => {
  it("keeps a blocked run with queued work reserved for its resume", async () => {
    mocks.assertAllocation.mockResolvedValue({ mode: "allocation", remaining: 1, unit: "units" });
    const client = {
      $queryRaw: vi.fn(),
      rankCheckRun: {
        findMany: vi.fn(async () => [
          {
            estimatedCostCents: 1,
            selectionSpec: {
              ...providerAllocationReservation("connection_1", 1),
              kind: "single",
            },
          },
        ]),
      },
    };

    await expect(
      reserveProviderAllocation(client as never, {
        connection: { id: "connection_1", provider: "serpapi" },
        estimatedCostCents: 1,
        estimatedUsageQuantity: 1,
        now: new Date("2026-09-04T12:00:00.000Z"),
        projectId: "project_1",
      }),
    ).rejects.toBeInstanceOf(AllocationExhaustedError);
    expect(client.rankCheckRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              items: { some: { status: { in: ["queued", "running"] } } },
              status: "blocked",
            }),
          ]),
        }),
      }),
    );
  });
});
