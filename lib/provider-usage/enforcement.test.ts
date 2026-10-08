import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import { describe, expect, it, vi } from "vitest";
import { assertProviderAllocationAvailable, ProviderAllocationExhaustedError } from "./enforcement";

vi.mock("@/lib/providers/execution-authority", () => ({
  readDeploymentMeteringPreflightAuthority: vi.fn(async () => "legacy"),
}));

const catalog = [
  {
    id: "metered",
    allocation: {
      allocationUnit: "cents",
      billing: "metered",
      kind: "billable",
      quotaReset: "none",
    },
    label: "Metered",
    kind: "serp",
    defaultStatus: "ready",
  },
  {
    id: "quota",
    allocation: {
      allocationUnit: "units",
      billing: "quota",
      kind: "billable",
      quotaReset: "billing_cycle",
    },
    label: "Quota",
    kind: "serp",
    defaultStatus: "ready",
  },
] as const;
function db(
  project: object,
  connection: object,
  aggregate: object,
  missingQuantityCount = 0,
  groups: object[] = [],
) {
  return {
    project: { findUnique: vi.fn().mockResolvedValue(project) },
    providerConnection: { findFirst: vi.fn().mockResolvedValue(connection) },
    providerCostEntry: {
      aggregate: vi.fn().mockResolvedValue(aggregate),
      count: vi.fn().mockResolvedValue(missingQuantityCount),
      groupBy: vi.fn().mockResolvedValue(groups),
    },
  };
}
const initializedProject = { budgetCapCents: 50, providerAllocationsInitializedAt: new Date() };

describe("provider allocation enforcement", () => {
  it("defers uninitialized projects to the legacy dollar cap", async () => {
    const legacy = vi.fn().mockResolvedValue(undefined);
    const client = db({ budgetCapCents: 50, providerAllocationsInitializedAt: null }, {}, {});
    await expect(
      assertProviderAllocationAvailable(
        {
          catalog,
          connectionId: "c1",
          estimatedCostCents: 3,
          legacyBudgetCheck: legacy,
          projectId: "p1",
          provider: "metered",
          surface: "programmatic",
        },
        client,
      ),
    ).resolves.toMatchObject({ mode: "legacy" });
    expect(legacy).toHaveBeenCalledWith(50, 3);
    expect(client.providerCostEntry.aggregate).not.toHaveBeenCalled();
  });
  it("keeps the project cap after a legacy connection reconnect", async () => {
    const legacy = vi.fn().mockResolvedValue(undefined);
    const client = db({ budgetCapCents: 75, providerAllocationsInitializedAt: null }, {}, {});
    await assertProviderAllocationAvailable(
      {
        catalog,
        connectionId: "reconnected",
        estimatedCostCents: 4,
        legacyBudgetCheck: legacy,
        projectId: "p1",
        provider: "metered",
        surface: "app",
      },
      client,
    );
    expect(legacy).toHaveBeenCalledWith(75, 4);
  });

  it("blocks an initialized metered connection using recorded cost", async () => {
    const client = db(
      initializedProject,
      {
        allocationAmountPerMonth: 10,
        allocationUnit: "cents",
        credentialSource: "own",
        programmaticAllocationAmountPerMonth: null,
      },
      { _count: { _all: 2 }, _sum: { costCents: 9, priceCents: null } },
    );
    await expect(
      assertProviderAllocationAvailable(
        {
          catalog,
          connectionId: "c1",
          estimatedCostCents: 2,
          projectId: "p1",
          provider: "metered",
          surface: "app",
        },
        client,
      ),
    ).rejects.toBeInstanceOf(ProviderAllocationExhaustedError);
  });
  it("does not consult the legacy cap after an explicit connection allocation", async () => {
    const legacy = vi.fn().mockResolvedValue(undefined);
    const client = db(
      initializedProject,
      { allocationAmountPerMonth: 10, allocationUnit: "cents", credentialSource: "own" },
      { _count: { _all: 0 }, _sum: { costCents: 0, priceCents: null } },
    );
    await expect(
      assertProviderAllocationAvailable(
        {
          catalog,
          connectionId: "c1",
          estimatedCostCents: 2,
          legacyBudgetCheck: legacy,
          projectId: "p1",
          provider: "metered",
          surface: "app",
        },
        client,
      ),
    ).resolves.toMatchObject({ mode: "allocation", remaining: 10, surface: "app" });
    expect(legacy).not.toHaveBeenCalled();
  });

  it("uses native quantity for quota providers and isolates provider ledgers", async () => {
    const client = db(
      initializedProject,
      { allocationAmountPerMonth: 5, allocationUnit: "units" },
      { _count: { _all: 2 }, _sum: { costCents: 100, usageQuantity: 4 } },
    );
    await expect(
      assertProviderAllocationAvailable(
        {
          catalog,
          connectionId: "quota-c",
          estimatedCostCents: 999,
          estimatedUsageQuantity: 2,
          projectId: "p1",
          provider: "quota",
          surface: "app",
        },
        client,
      ),
    ).rejects.toBeInstanceOf(ProviderAllocationExhaustedError);
    expect(client.providerCostEntry.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ connectionId: "quota-c" }) }),
    );
  });
  it("blocks uncertain legacy usage without guessing a quantity", async () => {
    const client = db(
      initializedProject,
      { allocationAmountPerMonth: 5, allocationUnit: "units" },
      { _count: { _all: 2 }, _sum: { costCents: 0, usageQuantity: 4 } },
      1,
    );
    await expect(
      assertProviderAllocationAvailable(
        {
          catalog,
          connectionId: "c1",
          estimatedCostCents: 0,
          projectId: "p1",
          provider: "quota",
          surface: "app",
        },
        client,
      ),
    ).rejects.toBeInstanceOf(ProviderUsagePersistenceError);
    expect(client.providerCostEntry.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ connectionId: "c1", AND: expect.any(Array) }),
    });
  });

  it("does not admit spending against an entirely unmeasured quota ledger", async () => {
    const client = db(
      initializedProject,
      { allocationAmountPerMonth: 2, allocationUnit: "units" },
      { _count: { _all: 2 }, _sum: { costCents: 0, usageQuantity: null } },
      2,
    );
    await expect(
      assertProviderAllocationAvailable(
        {
          catalog,
          connectionId: "c1",
          estimatedCostCents: 0,
          projectId: "p1",
          provider: "quota",
          surface: "app",
        },
        client,
      ),
    ).rejects.toBeInstanceOf(ProviderUsagePersistenceError);
  });
  it("rejects a recorded hosted cents row without a price instead of treating it as free", async () => {
    const client = db(
      initializedProject,
      {
        credentialSource: "hosted",
        creditsAllocationAmountPerMonth: 10,
      },
      { _count: { _all: 0 }, _sum: { costCents: 0, priceCents: null } },
      1,
    );
    await expect(
      assertProviderAllocationAvailable(
        {
          catalog,
          connectionId: "c1",
          estimatedCostCents: 1,
          projectId: "p1",
          provider: "metered",
          surface: "app",
        },
        client,
      ),
    ).rejects.toBeInstanceOf(ProviderUsagePersistenceError);
    expect(client.providerCostEntry.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        AND: [
          { OR: [{ source: { in: ["app", "worker"] } }, { source: null }] },
          {
            OR: [
              {
                measurementStatus: "unknown",
                OR: [expect.anything(), expect.anything()],
              },
              { measurementStatus: "recorded", priceCents: null },
            ],
          },
        ],
      }),
    });
  });

  it("allows a recent active receipt protected by its existing launch reservation", async () => {
    const client = db(
      initializedProject,
      { allocationAmountPerMonth: 10, allocationUnit: "units" },
      { _count: { _all: 1 }, _sum: { costCents: 0, usageQuantity: 2 } },
    );
    client.providerCostEntry.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    await expect(
      assertProviderAllocationAvailable(
        {
          catalog,
          connectionId: "c1",
          estimatedCostCents: 0,
          estimatedUsageQuantity: 2,
          projectId: "p1",
          provider: "quota",
          surface: "app",
        },
        client,
      ),
    ).resolves.toMatchObject({ remaining: 8 });
  });

  it("allows initialized connections with no allocation for the requested surface", async () => {
    const client = db(
      initializedProject,
      {
        allocationAmountPerMonth: null,
        allocationUnit: null,
        programmaticAllocationAmountPerMonth: null,
      },
      { _count: { _all: 9 }, _sum: { costCents: 100, usageQuantity: 9 } },
    );
    await expect(
      assertProviderAllocationAvailable(
        {
          catalog,
          connectionId: "c1",
          estimatedCostCents: 100,
          projectId: "p1",
          provider: "metered",
          surface: "app",
        },
        client,
      ),
    ).resolves.toMatchObject({ mode: "allocation", remaining: null, surface: "app" });
  });
});
