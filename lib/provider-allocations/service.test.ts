import type { ProviderCatalogEntry } from "@/lib/providers/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  backfill: vi.fn(),
  readBudgets: vi.fn(),
  putBudget: vi.fn(),
  prisma: { $transaction: vi.fn() },
  writeAudit: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/metering/spending-limit-store", () => ({
  readSpendingBudgets: mocks.readBudgets,
  putSpendingBudget: mocks.putBudget,
}));
vi.mock("./legacy-backfill", () => ({
  backfillLegacyProjectAllocationInLockedTransaction: mocks.backfill,
}));
vi.mock("@/lib/auth/authorize", async (original) => ({
  ...(await original()),
  authorize: mocks.authorize,
}));
vi.mock("@/lib/auth/audit", async (original) => ({
  ...(await original()),
  writeAudit: mocks.writeAudit,
}));

import { fundingSpendingBudgets } from "@/lib/metering/spending-limits";
import { setProviderConnectionAllocation } from "./service";

const catalog = [
  {
    allocation: {
      allocationUnit: "cents",
      billing: "metered",
      kind: "billable",
      quotaReset: "none",
    },
    defaultStatus: "ready",
    id: "metered",
    kind: "serp",
    label: "Metered",
  },
] as const satisfies readonly ProviderCatalogEntry[];
const actor = { id: "user_1", memberships: [{ projectId: "project_1", role: "admin" as const }] };
function transaction() {
  return {
    $queryRaw: vi.fn(),
    project: {
      findUnique: vi.fn().mockResolvedValueOnce({ id: "project_1" }).mockResolvedValue({
        id: "project_1",
        isSample: false,
        publicId: "prj_abcdefghijklmnopqrstuvwx",
        writeMode: "active",
      }),
      update: vi.fn(),
    },
    providerConnection: {
      findFirst: vi.fn().mockResolvedValue({ id: "connection_1", provider: "metered" }),
      update: vi.fn(),
    },
  };
}
const input = {
  actor,
  allocations: { app: { amountPerMonth: 2500, unit: "cents" as const } },
  catalog,
  connectionPublicId: "conn_abcdefghijklmnopqrstuvwx",
  projectPublicId: "prj_abcdefghijklmnopqrstuvwx",
};
function existing() {
  mocks.readBudgets.mockResolvedValue(
    fundingSpendingBudgets(
      "default",
      { id: "connection_1", provider: "metered", unit: "cents", app: "1000", programmatic: "500" },
      "byok",
      4,
    ),
  );
}
describe("provider allocation Store commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readBudgets.mockResolvedValue([]);
    mocks.putBudget.mockImplementation(async (_tx, b) => b);
  });
  it("resolves public ids, locks, authorizes, persists exact Store limits and audits atomically", async () => {
    const tx = transaction();
    mocks.prisma.$transaction.mockImplementation((callback) => callback(tx));
    await setProviderConnectionAllocation(input);
    expect(mocks.authorize).toHaveBeenCalledWith(actor, "manage", {
      projectId: "project_1",
      type: "provider_connection",
    });
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.project.findUnique.mock.invocationCallOrder[1] ?? 0,
    );
    expect(mocks.putBudget).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        id: "own-connection:connection_1:app",
        version: 1,
        limit: { unit: "cents", value: 25000000n, scale: 4 },
        onExceed: "block",
      }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        targetId: input.connectionPublicId,
        after: {
          app: input.allocations.app,
          programmatic: null,
          credits: { app: null, programmatic: null },
        },
      }),
      tx,
    );
  });
  it("edits never backfill a project cap or write legacy connection limits", async () => {
    const tx = transaction();
    mocks.prisma.$transaction.mockImplementation((callback) => callback(tx));
    await setProviderConnectionAllocation(input);
    expect(mocks.backfill).not.toHaveBeenCalled();
    expect(tx.providerConnection.update).not.toHaveBeenCalled();
    expect(tx.project.update).not.toHaveBeenCalled();
  });
  it("updates both surfaces with their retained identities and versions", async () => {
    existing();
    const tx = transaction();
    mocks.prisma.$transaction.mockImplementation((callback) => callback(tx));
    await setProviderConnectionAllocation({
      ...input,
      allocations: { ...input.allocations, programmatic: { amountPerMonth: 1200, unit: "cents" } },
    });
    expect(mocks.putBudget.mock.calls.map(([, b]) => [b.id, b.version])).toEqual([
      ["own-connection:connection_1:app", 5],
      ["own-connection:connection_1:programmatic", 5],
    ]);
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        before: {
          app: { amountPerMonth: 1000, unit: "cents" },
          programmatic: { amountPerMonth: 500, unit: "cents" },
          credits: { app: null, programmatic: null },
        },
      }),
      tx,
    );
  });
  it("omitted surfaces retain their stored limit and version; explicit null clears only the named budget", async () => {
    existing();
    const tx = transaction();
    mocks.prisma.$transaction.mockImplementation((callback) => callback(tx));
    const result = await setProviderConnectionAllocation({ ...input, allocations: { app: null } });
    expect(mocks.putBudget).toHaveBeenCalledOnce();
    expect(mocks.putBudget).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ limit: null, version: 5 }),
    );
    expect(result.programmatic).toEqual({ amountPerMonth: 500, unit: "cents" });
  });
  it("rejects mismatched native units before Store writes", async () => {
    const tx = transaction();
    mocks.prisma.$transaction.mockImplementation((callback) => callback(tx));
    await expect(
      setProviderConnectionAllocation({
        ...input,
        allocations: { ...input.allocations, programmatic: { amountPerMonth: 100, unit: "units" } },
      }),
    ).rejects.toThrow("share one unit");
    expect(mocks.putBudget).not.toHaveBeenCalled();
  });
  it("cannot reinterpret an existing Store counter in a different native unit", async () => {
    mocks.readBudgets.mockResolvedValue(
      fundingSpendingBudgets(
        "default",
        { id: "connection_1", provider: "metered", unit: "units", app: "10", programmatic: null },
        "byok",
        1,
      ),
    );
    const tx = transaction();
    mocks.prisma.$transaction.mockImplementation((callback) => callback(tx));
    await expect(setProviderConnectionAllocation(input)).rejects.toThrow("unit changed");
    expect(mocks.putBudget).not.toHaveBeenCalled();
  });
  it("authorization failure cannot mutate budgets", async () => {
    const tx = transaction();
    const denied = new Error("forbidden");
    mocks.authorize.mockImplementationOnce(() => {
      throw denied;
    });
    mocks.prisma.$transaction.mockImplementation((callback) => callback(tx));
    await expect(setProviderConnectionAllocation(input)).rejects.toBe(denied);
    expect(mocks.putBudget).not.toHaveBeenCalled();
  });
  it("a migration hold is rechecked under the project lock", async () => {
    const tx = transaction();
    tx.project.findUnique
      .mockReset()
      .mockResolvedValueOnce({ id: "project_1" })
      .mockResolvedValueOnce({
        id: "project_1",
        isSample: false,
        publicId: input.projectPublicId,
        writeMode: "migration_hold",
      });
    mocks.prisma.$transaction.mockImplementation((callback) => callback(tx));
    await expect(setProviderConnectionAllocation(input)).rejects.toMatchObject({
      code: "project_read_only",
    });
    expect(mocks.putBudget).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });
  it("Store conflicts and audit failures abort the caller transaction", async () => {
    const tx = transaction();
    mocks.prisma.$transaction.mockImplementation((callback) => callback(tx));
    mocks.putBudget.mockRejectedValueOnce(new Error("budget conflict"));
    await expect(setProviderConnectionAllocation(input)).rejects.toThrow("budget conflict");
    expect(mocks.writeAudit).not.toHaveBeenCalled();
    mocks.writeAudit.mockRejectedValueOnce(new Error("audit failed"));
    await expect(setProviderConnectionAllocation(input)).rejects.toThrow("audit failed");
  });
  it("malformed public ids cannot open a transaction", async () => {
    await expect(
      setProviderConnectionAllocation({ ...input, connectionPublicId: "connection_1" }),
    ).rejects.toThrow("public resource ID");
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});
