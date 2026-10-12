import { projectTestBudget, usageReadFixture } from "@/lib/metering/read.test-fixture";
import { seedTestUsage } from "@/lib/metering/usage.test-fixture";
import { ownAllocationTag } from "@/lib/provider-usage/credential-version";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    $queryRaw: vi.fn(),
    project: { findUnique: vi.fn() },
    providerConnection: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/providers/execution-authority", () => ({
  readDeploymentMeteringPreflightAuthority: async () => "active",
}));

import { preflightProviderBudget } from "./paid-call-budget";

let store: Awaited<ReturnType<typeof usageReadFixture>>;
beforeEach(async () => {
  vi.clearAllMocks();
  store = await usageReadFixture();
  mocks.prisma.$queryRaw.mockImplementation(store.query);
  await store.budget(projectTestBudget(10000));
  mocks.prisma.project.findUnique.mockResolvedValue({
    ownerId: "owner",
    budgetCapCents: 1,
    providerAllocationsInitializedAt: new Date(),
  });
  mocks.prisma.providerConnection.findFirst.mockResolvedValue({
    credentialSource: "own",
    allocationUnit: "cents",
  });
});
afterEach(async () => store.db.close());
const input = {
  connectionId: "connection_1",
  projectId: "project_1",
  provider: "dataforseo",
  estimatedCostCents: 5,
  surface: "app" as const,
};
async function allocation(limit: number, used: number, unit = "cents", reserved = 0) {
  await store.budget(
    {
      ...projectTestBudget(limit),
      id: "allocation",
      unit,
      limit: { value: BigInt(limit), scale: 0, unit },
      surface: "app",
      scope: {
        kind: "tag",
        namespace: "default",
        tag: ownAllocationTag(input.provider, input.connectionId),
      },
    },
    used,
    reserved,
  );
  await seedTestUsage(store.db, {
    connectionId: input.connectionId,
    provider: input.provider,
    costCents: used,
  });
}
describe.each(["backlinks", "domain overview"])("%s aggregate Store preflight", () => {
  it("maps a Store project cap overage to budget_exhausted", async () => {
    await store.budget({ ...projectTestBudget(10), version: 2 });
    await expect(
      preflightProviderBudget({ ...input, estimatedCostCents: 11 }),
    ).rejects.toMatchObject({ outcome: { reason: "budget_exhausted" } });
  });
  it("uses the Store limit when the former project cap differs", async () => {
    await store.budget({ ...projectTestBudget(100), version: 2 }, 20);
    await allocation(100, 20);
    await expect(preflightProviderBudget(input)).resolves.toBeUndefined();
  });
  it("maps an exhausted initialized Store allocation to budget_exhausted", async () => {
    await allocation(10, 8);
    await expect(preflightProviderBudget(input)).rejects.toMatchObject({
      outcome: { provider: "dataforseo", reason: "budget_exhausted" },
    });
  });
});
it("uses the aggregate request estimate for Store quota allocations", async () => {
  const provider = "serpapi";
  await store.budget(
    {
      ...projectTestBudget(4),
      id: "quota",
      unit: "units",
      limit: { value: 4n, scale: 0, unit: "units" },
      surface: "app",
      scope: {
        kind: "tag",
        namespace: "default",
        tag: ownAllocationTag(provider, input.connectionId),
      },
    },
    2,
  );
  await seedTestUsage(store.db, {
    connectionId: input.connectionId,
    provider,
    costCents: 50,
    usageQuantity: 2,
  });
  await expect(
    preflightProviderBudget({
      ...input,
      provider,
      estimatedCostCents: 999,
      estimatedUsageQuantity: 3,
    }),
  ).rejects.toMatchObject({ outcome: { reason: "budget_exhausted" } });
});
it("includes outstanding Store reservations in advisory headroom", async () => {
  await allocation(10, 3, "cents", 3);
  await expect(preflightProviderBudget(input)).rejects.toMatchObject({
    outcome: { reason: "budget_exhausted" },
  });
});
it("maps an exhausted hosted Store charge budget without substituting provider cost", async () => {
  const { platformAllocationTag } = await import("@/lib/metering/paid-quote");
  mocks.prisma.providerConnection.findFirst.mockResolvedValue({ credentialSource: "hosted" });
  await store.budget(
    {
      ...projectTestBudget(10),
      id: "hosted-allocation",
      unit: "customer_cents",
      limit: { value: 10n, scale: 0, unit: "customer_cents" },
      surface: "app",
      scope: {
        kind: "tag",
        namespace: "default",
        tag: platformAllocationTag(input.provider, input.connectionId),
      },
    },
    10,
  );
  await expect(preflightProviderBudget(input)).rejects.toMatchObject({
    outcome: { reason: "budget_exhausted" },
  });
});
