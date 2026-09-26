import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ assertAllocation: vi.fn() }));
const { AllocationExhaustedError } = vi.hoisted(() => ({
  AllocationExhaustedError: class extends Error {
    constructor(readonly surface: "app" | "programmatic") {
      super("allocation reached");
    }
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/provider-usage/enforcement", () => ({
  assertProviderAllocationAvailable: mocks.assertAllocation,
  ProviderAllocationExhaustedError: AllocationExhaustedError,
}));

import { providerAllocationReservation, reserveProviderAllocation } from "./launch-preflight";

function client(runs: Array<Record<string, unknown>>) {
  return {
    $queryRaw: vi.fn(),
    rankCheckRun: { findMany: vi.fn(async () => runs) },
  };
}
const baseInput = {
  connection: { id: "connection_1", provider: "serpapi" },
  estimatedCostCents: 1,
  estimatedUsageQuantity: 1,
  now: new Date("2026-09-04T12:00:00.000Z"),
  projectId: "project_1",
};

describe("rank-check provider allocation reservations", () => {
  it("keeps a blocked run with queued work reserved for its resume", async () => {
    mocks.assertAllocation.mockResolvedValue({ mode: "allocation", remaining: 1, unit: "units" });
    const clientObject = client([
      {
        estimatedCostCents: 1,
        selectionSpec: {
          ...providerAllocationReservation("connection_1", 1),
          kind: "single",
        },
        source: null,
      },
    ]);

    await expect(
      reserveProviderAllocation(clientObject as never, { ...baseInput, surface: "app" }),
    ).rejects.toBeInstanceOf(AllocationExhaustedError);
    expect(clientObject.rankCheckRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { estimatedCostCents: true, selectionSpec: true, source: true },
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

  it("counts only programmatic reservations for a programmatic launch", async () => {
    mocks.assertAllocation.mockResolvedValue({ mode: "allocation", remaining: 1, unit: "units" });
    const programmaticReservation = {
      estimatedCostCents: 1,
      selectionSpec: { ...providerAllocationReservation("connection_1", 1), kind: "single" },
      source: "api",
    };
    const appReservation = {
      estimatedCostCents: 1,
      selectionSpec: { ...providerAllocationReservation("connection_1", 1), kind: "single" },
      source: "app",
    };

    await expect(
      reserveProviderAllocation(client([programmaticReservation, appReservation]) as never, {
        ...baseInput,
        surface: "programmatic",
      }),
    ).rejects.toBeInstanceOf(AllocationExhaustedError);
    await expect(
      reserveProviderAllocation(client([appReservation]) as never, {
        ...baseInput,
        surface: "programmatic",
      }),
    ).resolves.toBeUndefined();
  });

  it("counts app and legacy null-source reservations for an app launch", async () => {
    mocks.assertAllocation.mockResolvedValue({ mode: "allocation", remaining: 1, unit: "units" });
    const legacyReservation = {
      estimatedCostCents: 1,
      selectionSpec: { ...providerAllocationReservation("connection_1", 1), kind: "single" },
      source: null,
    };
    const programmaticReservation = {
      estimatedCostCents: 1,
      selectionSpec: { ...providerAllocationReservation("connection_1", 1), kind: "single" },
      source: "sdk",
    };

    await expect(
      reserveProviderAllocation(client([legacyReservation]) as never, {
        ...baseInput,
        surface: "app",
      }),
    ).rejects.toBeInstanceOf(AllocationExhaustedError);
    await expect(
      reserveProviderAllocation(client([programmaticReservation]) as never, {
        ...baseInput,
        surface: "app",
      }),
    ).resolves.toBeUndefined();
  });
});
