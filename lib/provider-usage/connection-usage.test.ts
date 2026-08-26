import { describe, expect, it, vi } from "vitest";
import { aggregateConnectionUsage } from "./connection-usage";

function db(aggregate: object, missingQuantityCount = 0) {
  return {
    providerCostEntry: {
      aggregate: vi.fn().mockResolvedValue(aggregate),
      count: vi.fn().mockResolvedValue(missingQuantityCount),
    },
  };
}

describe("aggregateConnectionUsage", () => {
  it("uses cost cents and counts every recorded request for metered connections", async () => {
    const client = db({ _count: { _all: 3 }, _sum: { costCents: "12.5", usageQuantity: 9 } });

    await expect(
      aggregateConnectionUsage(client, {
        connectionId: "connection_1",
        now: new Date("2026-08-26T12:00:00.000Z"),
        projectId: "project_1",
        unit: "cents",
      }),
    ).resolves.toEqual({ requestCount: 3, used: 12.5 });

    expect(client.providerCostEntry.count).not.toHaveBeenCalled();
  });

  it("uses native quantities and counts legacy rows without a quantity as one unit", async () => {
    const client = db({ _count: { _all: 4 }, _sum: { costCents: 99, usageQuantity: "5" } }, 2);

    await expect(
      aggregateConnectionUsage(client, {
        connectionId: "connection_1",
        now: new Date("2026-08-26T12:00:00.000Z"),
        projectId: "project_1",
        unit: "units",
      }),
    ).resolves.toEqual({ requestCount: 4, used: 7 });

    expect(client.providerCostEntry.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ connectionId: "connection_1", usageQuantity: null }),
    });
  });
});
