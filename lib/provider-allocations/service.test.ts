import type { ProviderCatalogEntry } from "@/lib/providers/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  backfill: vi.fn(),
  prisma: { $transaction: vi.fn() },
  writeAudit: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
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
    auditLog: { create: vi.fn() },
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
      findFirst: vi.fn().mockResolvedValue({
        allocationAmountPerMonth: null,
        allocationUnit: null,
        id: "connection_1",
        provider: "metered",
      }),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };
}
const input = {
  actor,
  allocation: { amountPerMonth: 2500, unit: "cents" as const },
  catalog,
  connectionPublicId: "conn_abcdefghijklmnopqrstuvwx",
  projectPublicId: "prj_abcdefghijklmnopqrstuvwx",
};

describe("provider allocation service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.backfill.mockResolvedValue({
      internalPrimaryConnectionId: "connection_1",
      status: "backfilled",
    });
  });

  it("resolves public ids, authorizes, writes, and audits in one transaction", async () => {
    const tx = transaction();
    mocks.prisma.$transaction.mockImplementation((callback) => callback(tx));
    await setProviderConnectionAllocation(input);
    expect(mocks.authorize).toHaveBeenCalledWith(actor, "manage", {
      projectId: "project_1",
      type: "provider_connection",
    });
    expect(tx.project.findUnique).toHaveBeenNthCalledWith(1, {
      select: { id: true },
      where: { publicId: "prj_abcdefghijklmnopqrstuvwx" },
    });
    expect(tx.project.findUnique).toHaveBeenNthCalledWith(2, {
      select: { id: true, isSample: true, publicId: true, writeMode: true },
      where: { id: "project_1" },
    });
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.project.findUnique.mock.invocationCallOrder[1] ?? 0,
    );
    expect(tx.providerConnection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: "project_1", publicId: "conn_abcdefghijklmnopqrstuvwx" },
      }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ targetId: "conn_abcdefghijklmnopqrstuvwx" }),
      tx,
    );
  });

  it("materializes the legacy allocation before applying the explicit allocation", async () => {
    const tx = transaction();
    mocks.prisma.$transaction.mockImplementation((callback) => callback(tx));

    await setProviderConnectionAllocation(input);

    expect(mocks.backfill).toHaveBeenCalledWith(tx, "project_1", catalog);
    expect(mocks.backfill.mock.invocationCallOrder[0]).toBeLessThan(
      tx.providerConnection.update.mock.invocationCallOrder[0] ?? 0,
    );
    expect(tx.providerConnection.update).toHaveBeenCalledWith({
      data: { allocationAmountPerMonth: 2500, allocationUnit: "cents" },
      where: { id: "connection_1" },
    });
  });

  it("does not write when authorization fails", async () => {
    const tx = transaction();
    const denied = new Error("forbidden");
    mocks.authorize.mockImplementationOnce(() => {
      throw denied;
    });
    mocks.prisma.$transaction.mockImplementation((callback) => callback(tx));
    await expect(setProviderConnectionAllocation(input)).rejects.toBe(denied);
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.providerConnection.update).not.toHaveBeenCalled();
  });

  it("rejects a migration hold that begins before the locked reread", async () => {
    const tx = transaction();
    tx.project.findUnique
      .mockReset()
      .mockResolvedValueOnce({ id: "project_1" })
      .mockResolvedValueOnce({
        id: "project_1",
        isSample: false,
        publicId: "prj_abcdefghijklmnopqrstuvwx",
        writeMode: "migration_hold",
      });
    mocks.prisma.$transaction.mockImplementation((callback) => callback(tx));

    await expect(setProviderConnectionAllocation(input)).rejects.toMatchObject({
      code: "project_read_only",
    });

    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.providerConnection.findFirst).not.toHaveBeenCalled();
    expect(tx.providerConnection.update).not.toHaveBeenCalled();
    expect(tx.project.update).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("rolls the mutation back when audit fails", async () => {
    const tx = transaction();
    const auditFailure = new Error("audit failed");
    mocks.writeAudit.mockRejectedValueOnce(auditFailure);
    mocks.prisma.$transaction.mockImplementation(async (callback) => {
      await callback(tx);
    });
    await expect(setProviderConnectionAllocation(input)).rejects.toBe(auditFailure);
    expect(tx.providerConnection.update).toHaveBeenCalledOnce();
    expect(mocks.writeAudit).toHaveBeenCalledOnce();
  });

  it("rejects malformed public ids before opening a transaction", async () => {
    await expect(
      setProviderConnectionAllocation({ ...input, connectionPublicId: "connection_1" }),
    ).rejects.toThrow("public resource ID");
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});
