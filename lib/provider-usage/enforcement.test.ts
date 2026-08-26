import { describe, expect, it, vi } from "vitest";
import { assertProviderAllocationAvailable, ProviderAllocationExhaustedError } from "./enforcement";

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
function db(project: object, connection: object, aggregate: object, missingQuantityCount = 0) {
  return {
    project: { findUnique: vi.fn().mockResolvedValue(project) },
    providerConnection: { findFirst: vi.fn().mockResolvedValue(connection) },
    providerCostEntry: {
      aggregate: vi.fn().mockResolvedValue(aggregate),
      count: vi.fn().mockResolvedValue(missingQuantityCount),
    },
  };
}

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
      },
      client,
    );
    expect(legacy).toHaveBeenCalledWith(75, 4);
  });

  it("blocks an initialized metered connection using recorded cost", async () => {
    const client = db(
      { budgetCapCents: 50, providerAllocationsInitializedAt: new Date() },
      { allocationAmountPerMonth: 10, allocationUnit: "cents" },
      { _count: { _all: 2 }, _sum: { costCents: 9, usageQuantity: null } },
    );
    await expect(
      assertProviderAllocationAvailable(
        {
          catalog,
          connectionId: "c1",
          estimatedCostCents: 2,
          projectId: "p1",
          provider: "metered",
        },
        client,
      ),
    ).rejects.toBeInstanceOf(ProviderAllocationExhaustedError);
  });
  it("does not consult the legacy cap after an explicit connection allocation", async () => {
    const legacy = vi.fn().mockResolvedValue(undefined);
    const client = db(
      { budgetCapCents: 1, providerAllocationsInitializedAt: new Date() },
      { allocationAmountPerMonth: 10, allocationUnit: "cents" },
      { _count: { _all: 0 }, _sum: { costCents: 0, usageQuantity: null } },
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
        },
        client,
      ),
    ).resolves.toMatchObject({ mode: "allocation", remaining: 10 });
    expect(legacy).not.toHaveBeenCalled();
  });

  it("uses native quantity for quota providers and isolates provider ledgers", async () => {
    const client = db(
      { budgetCapCents: 50, providerAllocationsInitializedAt: new Date() },
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
        },
        client,
      ),
    ).rejects.toBeInstanceOf(ProviderAllocationExhaustedError);
    expect(client.providerCostEntry.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ connectionId: "quota-c" }) }),
    );
  });
  it("adds legacy rows without native quantity to the recorded quantity sum", async () => {
    const client = db(
      { budgetCapCents: 50, providerAllocationsInitializedAt: new Date() },
      { allocationAmountPerMonth: 5, allocationUnit: "units" },
      { _count: { _all: 2 }, _sum: { costCents: 0, usageQuantity: 4 } },
      1,
    );
    await expect(
      assertProviderAllocationAvailable(
        { catalog, connectionId: "c1", estimatedCostCents: 0, projectId: "p1", provider: "quota" },
        client,
      ),
    ).rejects.toBeInstanceOf(ProviderAllocationExhaustedError);
    expect(client.providerCostEntry.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ connectionId: "c1", usageQuantity: null }),
    });
  });

  it("counts one unit when a quota provider has no native quantity", async () => {
    const client = db(
      { budgetCapCents: 50, providerAllocationsInitializedAt: new Date() },
      { allocationAmountPerMonth: 2, allocationUnit: "units" },
      { _count: { _all: 2 }, _sum: { costCents: 0, usageQuantity: null } },
      2,
    );
    await expect(
      assertProviderAllocationAvailable(
        { catalog, connectionId: "c1", estimatedCostCents: 0, projectId: "p1", provider: "quota" },
        client,
      ),
    ).rejects.toBeInstanceOf(ProviderAllocationExhaustedError);
  });
  it("allows initialized connections with no allocation", async () => {
    const client = db(
      { budgetCapCents: 1, providerAllocationsInitializedAt: new Date() },
      { allocationAmountPerMonth: null, allocationUnit: null },
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
        },
        client,
      ),
    ).resolves.toMatchObject({ mode: "allocation", remaining: null });
  });
});
