import { monthUtcRange } from "@/lib/rank-check/budget";
import { describe, expect, it, vi } from "vitest";
import { aggregateConnectionUsage } from "./connection-usage";

function db(input: { aggregate?: object; unconfirmedCount?: number } = {}) {
  return {
    providerCostEntry: {
      aggregate: vi.fn().mockResolvedValue(
        input.aggregate ?? {
          _count: { _all: 0 },
          _sum: { costCents: null, priceCents: null, usageQuantity: null },
        },
      ),
      count: vi.fn().mockResolvedValue(input.unconfirmedCount ?? 0),
      groupBy: vi.fn(),
    },
  };
}

const NOW = new Date("2026-08-26T12:00:00.000Z");

async function aggregate(
  client: ReturnType<typeof db>,
  unit: "cents" | "units",
  credentialSource: "hosted" | "own" = "own",
  surface?: "app" | "programmatic",
) {
  return aggregateConnectionUsage(client, {
    connectionId: "connection_1",
    credentialSource,
    now: NOW,
    projectId: "project_1",
    ...(surface ? { surface } : {}),
    unit,
  });
}

describe("aggregateConnectionUsage", () => {
  it("sums confirmed provider cost cents for own-key rows, ignoring any price", async () => {
    const client = db({
      aggregate: { _count: { _all: 3 }, _sum: { costCents: "12.5", priceCents: 999 } },
    });

    await expect(aggregate(client, "cents", "own")).resolves.toEqual({
      requestCount: 3,
      unconfirmedCount: 0,
      used: 12.5,
    });

    expect(client.providerCostEntry.aggregate).toHaveBeenCalledWith({
      _count: { _all: true },
      _sum: { costCents: true },
      where: {
        cached: false,
        connectionId: "connection_1",
        createdAt: monthUtcRange(NOW),
        credentialSource: "own",
        measurementStatus: "recorded",
        projectId: "project_1",
      },
    });
    expect(client.providerCostEntry.groupBy).not.toHaveBeenCalled();
  });

  it("charges hosted rows their price instead of the provider cost", async () => {
    const client = db({
      aggregate: { _count: { _all: 1 }, _sum: { costCents: 10, priceCents: 13 } },
    });

    await expect(aggregate(client, "cents", "hosted")).resolves.toEqual({
      requestCount: 1,
      unconfirmedCount: 0,
      used: 13,
    });
    expect(client.providerCostEntry.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          credentialSource: "hosted",
          priceCents: { not: null },
        }),
      }),
    );
  });

  it("treats an explicit hosted price of zero as confirmed", async () => {
    const client = db({
      aggregate: { _count: { _all: 1 }, _sum: { costCents: 10, priceCents: 0 } },
    });

    await expect(aggregate(client, "cents", "hosted")).resolves.toEqual({
      requestCount: 1,
      unconfirmedCount: 0,
      used: 0,
    });
  });

  it("keeps a mixed-source month on separate counters", async () => {
    const client = db();
    client.providerCostEntry.aggregate.mockImplementation(
      async (query: { where: { credentialSource: string } }) =>
        query.where.credentialSource === "hosted"
          ? { _count: { _all: 1 }, _sum: { costCents: 20, priceCents: 13 } }
          : { _count: { _all: 1 }, _sum: { costCents: 10, priceCents: 999 } },
    );

    await expect(aggregate(client, "cents", "own")).resolves.toEqual({
      requestCount: 1,
      unconfirmedCount: 0,
      used: 10,
    });
    await expect(aggregate(client, "cents", "hosted")).resolves.toEqual({
      requestCount: 1,
      unconfirmedCount: 0,
      used: 13,
    });
  });

  it("reports a recorded hosted row without a price as unconfirmed, never as cost or zero", async () => {
    const client = db({
      aggregate: { _count: { _all: 0 }, _sum: { costCents: 20, priceCents: null } },
      unconfirmedCount: 1,
    });

    await expect(aggregate(client, "cents", "hosted")).resolves.toEqual({
      requestCount: 1,
      unconfirmedCount: 1,
      used: 0,
    });

    expect(client.providerCostEntry.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        credentialSource: "hosted",
        AND: [
          {
            OR: [{ measurementStatus: { not: "recorded" } }, { priceCents: null }],
          },
        ],
      }),
    });
  });

  it("counts unknown-status rows as unconfirmed for own-key cents too", async () => {
    const client = db({
      aggregate: { _count: { _all: 2 }, _sum: { costCents: "1.75", priceCents: null } },
      unconfirmedCount: 3,
    });

    await expect(aggregate(client, "cents", "own")).resolves.toEqual({
      requestCount: 5,
      unconfirmedCount: 3,
      used: 1.75,
    });
  });

  it("keeps zero a valid confirmed result", async () => {
    const client = db({});

    await expect(aggregate(client, "cents")).resolves.toEqual({
      requestCount: 0,
      unconfirmedCount: 0,
      used: 0,
    });
  });

  it("reports settled quantity as used and unsettled rows separately, never as +1 each", async () => {
    const client = db({
      aggregate: { _count: { _all: 1 }, _sum: { costCents: 99, usageQuantity: "5" } },
      unconfirmedCount: 2,
    });

    await expect(aggregate(client, "units", "own")).resolves.toEqual({
      requestCount: 3,
      unconfirmedCount: 2,
      used: 5,
    });

    expect(client.providerCostEntry.aggregate).toHaveBeenCalledWith({
      _count: { _all: true },
      _sum: { costCents: true, usageQuantity: true },
      where: {
        cached: false,
        connectionId: "connection_1",
        createdAt: monthUtcRange(NOW),
        credentialSource: "own",
        measurementStatus: "recorded",
        projectId: "project_1",
        usageQuantity: { not: null },
      },
    });
    expect(client.providerCostEntry.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        credentialSource: "own",
        AND: [{ OR: [{ measurementStatus: { not: "recorded" } }, { usageQuantity: null }] }],
      }),
    });
  });

  it("treats recorded legacy rows without a quantity as unconfirmed for units", async () => {
    const client = db({
      aggregate: { _count: { _all: 0 }, _sum: { costCents: 0, usageQuantity: null } },
      unconfirmedCount: 4,
    });

    await expect(aggregate(client, "units")).resolves.toEqual({
      requestCount: 4,
      unconfirmedCount: 4,
      used: 0,
    });
  });

  it("combines the app surface filter with the hosted price condition through AND", async () => {
    const client = db({
      aggregate: { _count: { _all: 1 }, _sum: { costCents: 3, priceCents: 4 } },
    });

    await aggregate(client, "cents", "hosted", "app");

    expect(client.providerCostEntry.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        cached: false,
        connectionId: "connection_1",
        createdAt: monthUtcRange(NOW),
        credentialSource: "hosted",
        projectId: "project_1",
        OR: [{ source: { in: ["app", "worker"] } }, { source: null }],
        AND: [
          {
            OR: [{ measurementStatus: { not: "recorded" } }, { priceCents: null }],
          },
        ],
      }),
    });
    expect(client.providerCostEntry.aggregate).toHaveBeenCalledWith({
      _count: { _all: true },
      _sum: { priceCents: true },
      where: expect.objectContaining({
        credentialSource: "hosted",
        measurementStatus: "recorded",
        priceCents: { not: null },
        OR: [{ source: { in: ["app", "worker"] } }, { source: null }],
      }),
    });
  });

  it("filters the programmatic surface to programmatic sources only", async () => {
    const client = db({
      aggregate: { _count: { _all: 1 }, _sum: { costCents: 3, priceCents: null } },
    });

    await aggregate(client, "cents", "own", "programmatic");

    expect(client.providerCostEntry.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          credentialSource: "own",
          measurementStatus: "recorded",
          source: { in: ["api", "sdk", "cli", "mcp"] },
        }),
      }),
    );
    const call = client.providerCostEntry.aggregate.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(call.where).not.toHaveProperty("OR");
  });

  it("excludes other projects by keeping the project scope in both queries", async () => {
    const client = db({
      aggregate: { _count: { _all: 1 }, _sum: { costCents: 3, priceCents: null } },
      unconfirmedCount: 1,
    });

    await aggregate(client, "cents");

    expect(client.providerCostEntry.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ projectId: "project_1" }) }),
    );
    expect(client.providerCostEntry.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ projectId: "project_1" }),
    });
  });
});
