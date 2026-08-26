import type { ProviderCatalogEntry } from "@/lib/providers/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ prisma: { $transaction: vi.fn() } }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

import { backfillLegacyProjectAllocation } from "./legacy-backfill";

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
  {
    allocation: {
      allocationUnit: "units",
      billing: "quota",
      kind: "billable",
      quotaReset: "calendar_month",
    },
    defaultStatus: "ready",
    id: "quota",
    kind: "serp",
    label: "Quota",
  },
  {
    allocation: { kind: "non_billable" },
    defaultStatus: "optional",
    id: "free",
    kind: "analytics",
    label: "Free",
  },
] as const satisfies readonly ProviderCatalogEntry[];

const row = (overrides = {}) => ({
  allocationAmountPerMonth: null,
  allocationUnit: null,
  enabled: true,
  id: "primary",
  priority: 10,
  provider: "metered",
  status: "connected",
  ...overrides,
});

describe("legacy provider allocation backfill", () => {
  beforeEach(() => vi.clearAllMocks());

  it("locks and transactionally backfills only the primary eligible metered connection", async () => {
    const tx = {
      $queryRaw: vi.fn(),
      project: {
        findUnique: vi.fn().mockResolvedValue({
          budgetCapCents: 5000,
          providerAllocationsInitializedAt: null,
          providerConnections: [
            row(),
            row({ id: "disabled", enabled: false }),
            row({ id: "disconnected", status: "needs_reauth" }),
            row({ id: "quota", provider: "quota" }),
            row({ id: "free", provider: "free" }),
          ],
        }),
        update: vi.fn(),
      },
      providerConnection: { update: vi.fn(), updateMany: vi.fn() },
    };
    mocks.prisma.$transaction.mockImplementation((callback) => callback(tx));
    await expect(backfillLegacyProjectAllocation("project_1", catalog)).resolves.toEqual({
      internalPrimaryConnectionId: "primary",
      status: "backfilled",
    });
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.providerConnection.updateMany).toHaveBeenCalledWith({
      data: { allocationAmountPerMonth: null, allocationUnit: null },
      where: { projectId: "project_1" },
    });
    expect(tx.providerConnection.update).toHaveBeenCalledWith({
      data: { allocationAmountPerMonth: 5000, allocationUnit: "cents" },
      where: { id: "primary" },
    });
    expect(tx.project.update).toHaveBeenCalledOnce();
    expect(mocks.prisma.$transaction.mock.calls[0]?.[1]).toMatchObject({
      isolationLevel: "Serializable",
    });
  });

  it("is idempotent once the project initialization marker is present", async () => {
    const tx = {
      $queryRaw: vi.fn(),
      project: {
        findUnique: vi.fn().mockResolvedValue({
          budgetCapCents: 5000,
          providerAllocationsInitializedAt: new Date(),
          providerConnections: [],
        }),
        update: vi.fn(),
      },
      providerConnection: { update: vi.fn(), updateMany: vi.fn() },
    };
    mocks.prisma.$transaction.mockImplementation((callback) => callback(tx));
    await expect(backfillLegacyProjectAllocation("project_1", catalog)).resolves.toEqual({
      internalPrimaryConnectionId: null,
      status: "already_backfilled",
    });
    expect(tx.providerConnection.updateMany).not.toHaveBeenCalled();
    expect(tx.project.update).not.toHaveBeenCalled();
  });

  it("defers disabled, disconnected, and non-metered projects without writing", async () => {
    const tx = {
      $queryRaw: vi.fn(),
      project: {
        findUnique: vi.fn().mockResolvedValue({
          budgetCapCents: 5000,
          providerAllocationsInitializedAt: null,
          providerConnections: [row({ id: "quota", provider: "quota" })],
        }),
        update: vi.fn(),
      },
      providerConnection: { update: vi.fn(), updateMany: vi.fn() },
    };
    mocks.prisma.$transaction.mockImplementation((callback) => callback(tx));
    await expect(backfillLegacyProjectAllocation("project_1", catalog)).resolves.toEqual({
      internalPrimaryConnectionId: null,
      status: "deferred_no_eligible",
    });
    expect(tx.providerConnection.updateMany).not.toHaveBeenCalled();
    expect(tx.providerConnection.update).not.toHaveBeenCalled();
    expect(tx.project.update).not.toHaveBeenCalled();
  });

  it.each([
    ["later reconnect", row({ status: "connected" })],
    ["later enable", row({ enabled: true })],
    ["disconnect and create", row({ id: "replacement", status: "connected" })],
    ["later first metered", row({ id: "first-metered", status: "connected" })],
  ])("backfills after %s creates an eligible metered connection", async (_label, eligible) => {
    const tx = {
      $queryRaw: vi.fn(),
      project: {
        findUnique: vi.fn().mockResolvedValue({
          budgetCapCents: 5000,
          providerAllocationsInitializedAt: null,
          providerConnections: [eligible],
        }),
        update: vi.fn(),
      },
      providerConnection: { update: vi.fn(), updateMany: vi.fn() },
    };
    mocks.prisma.$transaction.mockImplementation((callback) => callback(tx));
    await expect(backfillLegacyProjectAllocation("project_1", catalog)).resolves.toEqual({
      internalPrimaryConnectionId: eligible.id,
      status: "backfilled",
    });
    expect(tx.providerConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: eligible.id } }),
    );
    expect(tx.project.update).toHaveBeenCalledOnce();
  });
});
