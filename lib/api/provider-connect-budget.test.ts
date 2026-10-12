import type { StoredProviderAllocation } from "@/lib/provider-allocations/types";
import { PROVIDER_CATALOG } from "@/lib/providers/registry";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  verify: vi.fn(),
  saveBudget: vi.fn(),
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
vi.mock("@/lib/metering/spending-limit-store", () => ({ putSpendingBudget: mocks.saveBudget }));
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
import { connectProviderConnection } from "./provider-service";

function connection(
  provider: string,
  allocation: StoredProviderAllocation = { allocationAmountPerMonth: null, allocationUnit: null },
) {
  return {
    ...allocation,
    credentialSource: "own",
    rates: [],
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
  mocks.prisma.$queryRaw.mockResolvedValue([]);
  mocks.saveBudget.mockResolvedValue(undefined);
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
    expect(mocks.saveBudget).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        unit: "cents",
        limit: { unit: "cents", value: 950000n, scale: 4 },
      }),
    );
    expect(mocks.verify).toHaveBeenCalledOnce();

    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "provider.connect",
        after: expect.objectContaining({ id: result.id }),
      }),
      expect.anything(),
    );
  });

  it("seeds remaining searches, not the monthly plan capacity", async () => {
    mocks.verify.mockResolvedValue({ ok: true, balance: 198, availabilityTotal: 250 });
    const _result = await connectProviderConnection(
      { ...input, providerId: "serpapi", credentials: { apiKey: "test" } },
      context,
    );
    expect(mocks.saveBudget).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        unit: "units",
        limit: { unit: "units", value: 198000000n, scale: 6 },
      }),
    );
  });

  it.each([null, 17])("preserves an existing allocation of %s on reconnect", async (amount) => {
    rows.set(
      "dataforseo",
      connection("dataforseo", {
        allocationAmountPerMonth: amount,
        allocationUnit: amount === null ? null : "cents",
      }),
    );
    const _result = await connectProviderConnection(input, context);
    expect(rows.get("dataforseo")?.allocationAmountPerMonth).toBe(amount);
    expect(mocks.saveBudget).not.toHaveBeenCalled();
    expect(mocks.prisma.project.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.providerConnection.upsert.mock.calls[0]?.[0].update).not.toHaveProperty(
      "allocationAmountPerMonth",
    );
  });

  it.each([
    ["reserved", "Provider credential custody has unresolved paid operations"],
    ["pending", "Provider credential custody has unresolved paid operations"],
  ])("refuses reconnect under %s authority without changing budgets", async (_state, message) => {
    rows.set(
      "dataforseo",
      connection("dataforseo", { allocationAmountPerMonth: 17, allocationUnit: "cents" }),
    );
    mocks.prisma.$queryRaw.mockImplementation(async (query) =>
      query.join("").includes("count(*)") ? [{ count: 1n }] : [],
    );

    await expect(connectProviderConnection(input, context)).rejects.toThrow(message);

    expect(rows.get("dataforseo")?.allocationAmountPerMonth).toBe(17);
    expect(mocks.prisma.providerConnection.upsert).not.toHaveBeenCalled();
    expect(mocks.prisma.project.updateMany).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("preserves the existing project's legacy budget when adding a second provider", async () => {
    rows.set("dataforseo", connection("dataforseo"));
    project.budgetCapCents = 1200;
    mocks.verify.mockResolvedValue({ ok: true, balance: 200 });
    await connectProviderConnection(
      { ...input, providerId: "serpapi", credentials: { apiKey: "test" } },
      context,
    );
    expect(rows.get("dataforseo")?.allocationAmountPerMonth).toBeNull();
    expect(mocks.saveBudget).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        unit: "units",
        limit: { unit: "units", value: 200000000n, scale: 6 },
      }),
    );
  });

  it.each([0, -1, undefined, Number.NaN])(
    "does not invent a $50 budget for an unavailable balance (%s)",
    async (balance) => {
      mocks.verify.mockResolvedValue({ ok: true, balance });
      const _result = await connectProviderConnection(input, context);
      expect(mocks.saveBudget.mock.calls.every(([, budget]) => budget.limit === null)).toBe(true);
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
    const _result = await connectProviderConnection(
      { ...input, providerId: "gsc", credentials: { apiKey: "test" } },
      context,
    );
    expect(mocks.saveBudget.mock.calls.every(([, budget]) => budget.limit === null)).toBe(true);
    expect(mocks.prisma.project.updateMany).not.toHaveBeenCalled();
  });
});

describe("connect priority", () => {
  it("appends a new connection to the fallback chain when priority is omitted", async () => {
    rows.set("dataforseo", { ...connection("dataforseo"), priority: 0 });
    mocks.verify.mockResolvedValue({ ok: true, balance: 200 });
    const result = await connectProviderConnection(
      { ...input, providerId: "serpapi", credentials: { apiKey: "test" } },
      context,
    );
    expect(result.priority).toBe(1);
  });

  it("stores an explicit priority on connect", async () => {
    rows.set("dataforseo", { ...connection("dataforseo"), priority: 0 });
    mocks.verify.mockResolvedValue({ ok: true, balance: 200 });
    const result = await connectProviderConnection(
      { ...input, priority: 90, providerId: "serpapi", credentials: { apiKey: "test" } },
      context,
    );
    expect(result.priority).toBe(90);
  });

  it("promotes priority 0 and renumbers the rest of the chain", async () => {
    rows.set("dataforseo", { ...connection("dataforseo"), priority: 0 });
    mocks.verify.mockResolvedValue({ ok: true, balance: 200 });
    const result = await connectProviderConnection(
      { ...input, priority: 0, providerId: "serpapi", credentials: { apiKey: "test" } },
      context,
    );
    expect(result.priority).toBe(0);
    expect(rows.get("dataforseo")?.priority).toBe(1);
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
