import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ assertAllocation: vi.fn() }));

vi.mock("@/lib/provider-usage/enforcement", () => ({
  assertProviderAllocationAvailable: mocks.assertAllocation,
}));

import {
  assertQueuedRankCheckBatchAllocation,
  assertRankCheckConnectionAllocation,
} from "./allocation-enforcement";

describe("rank-check allocation enforcement surface forwarding", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-10-11T12:00:00Z"));
  });
  it("forwards the requested surface for a direct connection check", async () => {
    mocks.assertAllocation.mockResolvedValue({ mode: "allocation", remaining: 1 });
    const db = {} as never;

    await assertRankCheckConnectionAllocation(
      {
        connection: { costPerCheckCents: 1, id: "connection_1", provider: "dataforseo" },
        depth: 100,
        projectId: "project_1",
        surface: "programmatic",
      },
      db,
    );

    expect(mocks.assertAllocation).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: "connection_1", surface: "programmatic" }),
      db,
    );
  });

  it("forwards the requested surface for a queued batch check", async () => {
    mocks.assertAllocation.mockResolvedValue({ mode: "allocation", remaining: null });
    const db = {} as never;

    await assertQueuedRankCheckBatchAllocation(
      {
        connection: { id: "connection_1" },
        priority: "high",
        projectId: "project_1",
        surface: "app",
        tasks: [{ depth: 100 }],
      },
      db,
    );

    expect(mocks.assertAllocation).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: "connection_1", surface: "app" }),
      db,
    );
  });

  it("checks the connection budget with the same per-task native quotes", async () => {
    await assertQueuedRankCheckBatchAllocation(
      {
        connection: { id: "connection_1" },
        priority: "high",
        projectId: "project_1",
        surface: "programmatic",
        tasks: [
          { depth: 10, estimatedCostCents: 0 },
          { depth: 10, estimatedCostCents: 0.725 },
        ],
      },
      {} as never,
    );
    expect(mocks.assertAllocation).toHaveBeenLastCalledWith(
      expect.objectContaining({ estimatedCostCents: 0.725, estimatedUsageQuantity: 2 }),
      expect.anything(),
    );
  });
});
