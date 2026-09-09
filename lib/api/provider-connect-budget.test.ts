import type { StoredProviderAllocation } from "@/lib/provider-allocations/types";
import { PROVIDER_CATALOG } from "@/lib/providers/registry";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  verify: vi.fn(),
  prisma: {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    project: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    providerConnection: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/providers/crypto", () => ({
  decryptProviderCredentials: () => ({}),
  encryptSecret: () => "encrypted",
}));
vi.mock("@/lib/worker-intents/realtime", () => ({
  publishWorkerIntent: vi.fn().mockResolvedValue({}),
}));
vi.mock("./provider-verification", () => ({ verifyProviderConnectionBeforeSave: mocks.verify }));
vi.mock("./provider-audit", () => ({
  auditProviderMutation: mocks.audit,
  auditConnection: (value: unknown) => value,
}));

import { initialProviderAllocation } from "@/lib/provider-allocations/initial-allocation";
import { backfillLegacyProjectAllocationInLockedTransaction } from "@/lib/provider-allocations/legacy-backfill";
import { connectProviderConnection } from "./provider-service";

function connection(
  provider: string,
  allocation: StoredProviderAllocation = { allocationAmountPerMonth: null, allocationUnit: null },
) {
  return {
    ...allocation,
    provider,
    id: provider,
    credentialsEncrypted: "encrypted",
    priority: 0,
    publicId: "conn_a00000000000000000000000",
    projectId: "project_1",
    status: "connected",
    enabled: true,
    kind: "serp",
  };
}
const context = { actorId: "actor_1", projectId: "project_1" };
const input = {
  projectId: "prj_a00000000000000000000000",
  providerId: "dataforseo" as const,
  enabled: true,
  login: "test",
  secret: "test",
};
let rows: Map<string, ReturnType<typeof connection>>;
let project: { budgetCapCents: number; providerAllocationsInitializedAt: Date | null };

beforeEach(() => {
  vi.clearAllMocks();
  rows = new Map();
  project = { budgetCapCents: 5000, providerAllocationsInitializedAt: null };
  mocks.verify.mockResolvedValue({ ok: true, message: "Connected.", balance: 0.95372 });
  mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
  mocks.prisma.project.findUnique.mockImplementation(async () => ({
    ...project,
    providerConnections: [...rows.values()],
  }));
  for (const method of [mocks.prisma.project.update, mocks.prisma.project.updateMany]) {
    method.mockImplementation(async ({ data }) => {
      project = { ...project, ...data };
      return project;
    });
  }
  mocks.prisma.providerConnection.findUnique.mockImplementation(
    async ({ where }) => rows.get(where.projectId_provider.provider) ?? null,
  );
  mocks.prisma.providerConnection.findMany.mockImplementation(async () => [...rows.values()]);
  mocks.prisma.providerConnection.upsert.mockImplementation(async ({ create, update, where }) => {
    const provider = where.projectId_provider.provider;
    const previous = rows.get(provider);
    const row = previous ? { ...previous, ...update } : { ...connection(provider), ...create };
    rows.set(provider, row);
    return row;
  });
  mocks.prisma.providerConnection.updateMany.mockImplementation(async ({ data }) => {
    for (const [id, row] of rows) rows.set(id, { ...row, ...data });
  });
  mocks.prisma.providerConnection.update.mockImplementation(async ({ data, where }) => {
    const row = { ...rows.get(where.id), ...data };
    rows.set(where.id, row);
    return row;
  });
});

describe("starting provider budgets", () => {
  it("seeds whole cents from one account verification and cannot be overwritten by legacy backfill", async () => {
    const result = await connectProviderConnection(input, context);
    expect(result).toMatchObject({ allocationAmountPerMonth: 95, allocationUnit: "cents" });
    expect(mocks.verify).toHaveBeenCalledOnce();
    expect(project.providerAllocationsInitializedAt).toBeInstanceOf(Date);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "provider.connect",
        after: expect.objectContaining({ allocationAmountPerMonth: 95, allocationUnit: "cents" }),
      }),
      expect.anything(),
    );
    await expect(
      backfillLegacyProjectAllocationInLockedTransaction(
        mocks.prisma as never,
        context.projectId,
        PROVIDER_CATALOG,
      ),
    ).resolves.toMatchObject({ status: "already_backfilled" });
    expect(rows.get("dataforseo")?.allocationAmountPerMonth).toBe(95);
  });

  it("seeds remaining searches, not the monthly plan capacity", async () => {
    mocks.verify.mockResolvedValue({ ok: true, balance: 198, availabilityTotal: 250 });
    const result = await connectProviderConnection(
      { ...input, providerId: "serpapi", credentials: { apiKey: "test" } },
      context,
    );
    expect(result).toMatchObject({ allocationAmountPerMonth: 198, allocationUnit: "units" });
  });

  it.each([null, 17])("preserves an existing allocation of %s on reconnect", async (amount) => {
    rows.set(
      "dataforseo",
      connection("dataforseo", {
        allocationAmountPerMonth: amount,
        allocationUnit: amount === null ? null : "cents",
      }),
    );
    const result = await connectProviderConnection(input, context);
    expect(result.allocationAmountPerMonth).toBe(amount);
    expect(mocks.prisma.project.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.providerConnection.upsert.mock.calls[0]?.[0].update).not.toHaveProperty(
      "allocationAmountPerMonth",
    );
  });

  it("preserves the existing project's legacy budget when adding a second provider", async () => {
    rows.set("dataforseo", connection("dataforseo"));
    project.budgetCapCents = 1200;
    mocks.verify.mockResolvedValue({ ok: true, balance: 200 });
    await connectProviderConnection(
      { ...input, providerId: "serpapi", credentials: { apiKey: "test" } },
      context,
    );
    expect(rows.get("dataforseo")?.allocationAmountPerMonth).toBe(1200);
    expect(rows.get("serpapi")).toMatchObject({
      allocationAmountPerMonth: 200,
      allocationUnit: "units",
    });
  });

  it.each([0, -1, undefined, Number.NaN])(
    "does not invent a $50 budget for an unavailable balance (%s)",
    async (balance) => {
      mocks.verify.mockResolvedValue({ ok: true, balance });
      const result = await connectProviderConnection(input, context);
      expect(result).toMatchObject({ allocationAmountPerMonth: null, allocationUnit: null });
      expect(project.providerAllocationsInitializedAt).toBeInstanceOf(Date);
    },
  );

  it("does not mutate budgets after a failed account verification", async () => {
    mocks.verify.mockRejectedValue(new Error("Connection test failed"));
    await expect(connectProviderConnection(input, context)).rejects.toThrow(
      "Connection test failed",
    );
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("does not initialize a budget for analytics connections", async () => {
    const result = await connectProviderConnection(
      { ...input, providerId: "gsc", credentials: { apiKey: "test" } },
      context,
    );
    expect(result).toMatchObject({ allocationAmountPerMonth: null, allocationUnit: null });
    expect(mocks.prisma.project.updateMany).not.toHaveBeenCalled();
  });
});

describe("account balance conversion", () => {
  it.each([
    [0.29, 29],
    [1, 100],
    [0.95999, 95],
    [0.009, null],
    [Infinity, null],
    [1e12, null],
  ])("converts $%s to %s whole cents without exceeding availability", (balance, expected) => {
    const provider = PROVIDER_CATALOG.find((item) => item.id === "dataforseo");
    if (!provider) throw new Error("Expected the metered provider in the catalog.");
    expect(
      initialProviderAllocation(provider, { ok: true, message: "Connected", balance })
        .allocationAmountPerMonth,
    ).toBe(expected);
  });
});
