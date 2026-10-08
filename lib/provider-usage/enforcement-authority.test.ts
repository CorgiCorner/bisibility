import { beforeEach, expect, it, vi } from "vitest";
import { assertProviderAllocationAvailable } from "./enforcement";

const authority = vi.hoisted(() => ({ state: "active" as "active" | "draining" }));
vi.mock("@/lib/providers/execution-authority", () => ({
  readDeploymentMeteringPreflightAuthority: async () => authority.state,
}));
beforeEach(() => {
  authority.state = "active";
});
const catalog = [
  {
    id: "dataforseo",
    label: "DataForSEO",
    kind: "serp",
    defaultStatus: "ready",
    allocation: {
      kind: "billable",
      allocationUnit: "cents",
      billing: "metered",
      quotaReset: "none",
    },
  },
] as const;
function fixture() {
  const legacy = vi.fn();
  const db = {
    project: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ budgetCapCents: 0, providerAllocationsInitializedAt: null }),
    },
    providerConnection: { findFirst: vi.fn().mockResolvedValue({ credentialSource: "hosted" }) },
    providerCostEntry: { aggregate: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
  };
  const input = {
    catalog,
    connectionId: "connection",
    estimatedCostCents: 1,
    legacyBudgetCheck: legacy,
    projectId: "project",
    provider: "dataforseo",
    surface: "app" as const,
  };
  return { db, input, legacy };
}
it("persisted active Meter ownership controls admission even if legacy initialization metadata is absent", async () => {
  const { db, input, legacy } = fixture();
  await expect(assertProviderAllocationAvailable(input, db)).resolves.toMatchObject({
    mode: "allocation",
    remaining: null,
  });
  expect(legacy).not.toHaveBeenCalled();
  expect(db.providerCostEntry.aggregate).not.toHaveBeenCalled();
});
it("draining fails closed before an uninitialized project can take the legacy admission path", async () => {
  const { db, input, legacy } = fixture();
  authority.state = "draining";
  await expect(assertProviderAllocationAvailable(input, db)).rejects.toThrow();
  expect(legacy).not.toHaveBeenCalled();
  expect(db.providerCostEntry.aggregate).not.toHaveBeenCalled();
});
