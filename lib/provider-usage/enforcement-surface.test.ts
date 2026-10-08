import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertProviderAllocationAvailable, ProviderAllocationExhaustedError } from "./enforcement";

const mocks = vi.hoisted(() => ({ authority: vi.fn() }));
vi.mock("@/lib/providers/execution-authority", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/providers/execution-authority")>()),
  readDeploymentMeteringPreflightAuthority: mocks.authority,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authority.mockResolvedValue("legacy");
});

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

describe("provider allocation enforcement by request surface", () => {
  it("defers an active connection allocation to its authoritative admission", async () => {
    const client = db(
      initializedProject,
      { allocationAmountPerMonth: 0, allocationUnit: "cents", credentialSource: "own" },
      { _count: { _all: 0 }, _sum: { costCents: 0, usageQuantity: null } },
    );
    mocks.authority.mockResolvedValue("active");

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
    ).resolves.toMatchObject({ mode: "allocation", remaining: null, surface: "app" });

    expect(mocks.authority).toHaveBeenCalledWith("c1");
    expect(client.providerCostEntry.aggregate).not.toHaveBeenCalled();
  });

  it("refuses a draining connection before calculating legacy headroom", async () => {
    const client = db(initializedProject, {}, {});
    mocks.authority.mockResolvedValue("draining");

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
    ).rejects.toMatchObject({ name: "ProviderUsagePersistenceError" });

    expect(client.providerConnection.findFirst).not.toHaveBeenCalled();
    expect(client.providerCostEntry.aggregate).not.toHaveBeenCalled();
  });

  it("exhausts only the capped surface when the other surface is unlimited", async () => {
    const client = db(
      initializedProject,
      {
        allocationAmountPerMonth: 100,
        allocationUnit: "cents",
        programmaticAllocationAmountPerMonth: null,
      },
      { _count: { _all: 9 }, _sum: { costCents: 90, usageQuantity: null } },
      0,
      [{ credentialSource: "own", _count: { _all: 9 }, _sum: { costCents: 90, priceCents: null } }],
    );
    await expect(
      assertProviderAllocationAvailable(
        {
          catalog,
          connectionId: "c1",
          estimatedCostCents: 20,
          projectId: "p1",
          provider: "metered",
          surface: "app",
        },
        client,
      ),
    ).rejects.toMatchObject({ surface: "app" });
    await expect(
      assertProviderAllocationAvailable(
        {
          catalog,
          connectionId: "c1",
          estimatedCostCents: 20,
          projectId: "p1",
          provider: "metered",
          surface: "programmatic",
        },
        client,
      ),
    ).resolves.toMatchObject({ mode: "allocation", remaining: null, surface: "programmatic" });
  });

  it("exhausts only the programmatic surface when the app surface is unlimited", async () => {
    const client = db(
      initializedProject,
      {
        allocationAmountPerMonth: null,
        allocationUnit: null,
        programmaticAllocationAmountPerMonth: 100,
      },
      { _count: { _all: 9 }, _sum: { costCents: 90, usageQuantity: null } },
      0,
      [{ credentialSource: "own", _count: { _all: 9 }, _sum: { costCents: 90, priceCents: null } }],
    );
    await expect(
      assertProviderAllocationAvailable(
        {
          catalog,
          connectionId: "c1",
          estimatedCostCents: 20,
          projectId: "p1",
          provider: "metered",
          surface: "programmatic",
        },
        client,
      ),
    ).rejects.toMatchObject({ surface: "programmatic" });
    await expect(
      assertProviderAllocationAvailable(
        {
          catalog,
          connectionId: "c1",
          estimatedCostCents: 20,
          projectId: "p1",
          provider: "metered",
          surface: "app",
        },
        client,
      ),
    ).resolves.toMatchObject({ mode: "allocation", remaining: null, surface: "app" });
  });

  it("exhausts both capped surfaces independently", async () => {
    const client = db(
      initializedProject,
      {
        allocationAmountPerMonth: 10,
        allocationUnit: "cents",
        programmaticAllocationAmountPerMonth: 5,
      },
      { _count: { _all: 2 }, _sum: { costCents: 9, usageQuantity: null } },
      0,
      [{ credentialSource: "own", _count: { _all: 2 }, _sum: { costCents: 9, priceCents: null } }],
    );
    await expect(
      assertProviderAllocationAvailable(
        {
          catalog,
          connectionId: "c1",
          estimatedCostCents: 5,
          projectId: "p1",
          provider: "metered",
          surface: "app",
        },
        client,
      ),
    ).rejects.toMatchObject({ surface: "app" });
    await expect(
      assertProviderAllocationAvailable(
        {
          catalog,
          connectionId: "c1",
          estimatedCostCents: 5,
          projectId: "p1",
          provider: "metered",
          surface: "programmatic",
        },
        client,
      ),
    ).rejects.toMatchObject({ surface: "programmatic" });
  });

  it("names the exhausted surface in the error message", () => {
    expect(new ProviderAllocationExhaustedError("c1", "app").message).toBe(
      "Provider connection monthly allocation reached for the app surface.",
    );
    expect(new ProviderAllocationExhaustedError("c1", "programmatic").message).toBe(
      "Provider connection monthly allocation reached for the programmatic surface.",
    );
  });

  it("filters the app aggregation to app sources and null legacy rows", async () => {
    const client = db(
      initializedProject,
      { allocationAmountPerMonth: 1000, allocationUnit: "cents", credentialSource: "own" },
      { _count: { _all: 0 }, _sum: { costCents: 0, usageQuantity: null } },
    );
    await assertProviderAllocationAvailable(
      {
        catalog,
        connectionId: "c1",
        estimatedCostCents: 1,
        projectId: "p1",
        provider: "metered",
        surface: "app",
      },
      client,
    );
    expect(client.providerCostEntry.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          credentialSource: "own",
          OR: [{ source: { in: ["app", "worker"] } }, { source: null }],
        }),
      }),
    );
  });

  it("excludes null legacy rows from the programmatic aggregation", async () => {
    const client = db(
      initializedProject,
      {
        allocationAmountPerMonth: 1000,
        allocationUnit: "cents",
        credentialSource: "own",
        programmaticAllocationAmountPerMonth: 1000,
      },
      { _count: { _all: 0 }, _sum: { costCents: 0, usageQuantity: null } },
    );
    await assertProviderAllocationAvailable(
      {
        catalog,
        connectionId: "c1",
        estimatedCostCents: 1,
        projectId: "p1",
        provider: "metered",
        surface: "programmatic",
      },
      client,
    );
    expect(client.providerCostEntry.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          credentialSource: "own",
          source: { in: ["api", "sdk", "cli", "mcp"] },
        }),
      }),
    );
    const firstCall = client.providerCostEntry.aggregate.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(firstCall.where).not.toHaveProperty("OR");
  });
});
