import type { Budget, Meter } from "@usagekit/core";
import { createMeter } from "@usagekit/meter";
import { createManualClock, createMemoryStore } from "@usagekit/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  connections: vi.fn(),
  runtime: vi.fn(),
  authority: vi.fn(),
  ownBudgets: vi.fn(),
}));
vi.mock("@/lib/queries/_auth", () => ({ requireReadableProject: mocks.access }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { providerConnection: { findMany: mocks.connections } },
}));
vi.mock("./runtime", () => ({ meteringNamespace: () => "test", meteringRuntime: mocks.runtime }));
vi.mock("@/lib/providers/execution-extension", () => ({
  readDeploymentMeteringAuthority: mocks.authority,
}));
vi.mock("./own-budget-read", () => ({ readOwnConnectionBudgets: mocks.ownBudgets }));

import { getProjectMeteringUsage } from "./user-data";

const now = "2026-10-06T12:00:00.000Z";
const occurredAt = "2026-10-06T11:00:00.000Z";
const window = { kind: "calendar_month", timezone: "UTC" } as const;
const budgets: Budget[] = [
  {
    id: "project-budget",
    version: 1,
    scope: { kind: "group", namespace: "test", group: "project" },
    surface: "any",
    unit: "cents",
    limit: { unit: "cents", scale: 4, value: 1000000n },
    window,
    onExceed: "block",
  },
  {
    id: "worker-budget",
    version: 1,
    scope: { kind: "connection", namespace: "test", connection: "connection" },
    surface: "worker",
    unit: "units",
    limit: { unit: "units", scale: 6, value: 100000000n },
    window,
    onExceed: "block",
  },
  {
    id: "shared-tag",
    version: 1,
    scope: { kind: "tag", namespace: "test", tag: "shared" },
    surface: "any",
    unit: "cents",
    limit: { unit: "cents", scale: 4, value: 100000000n },
    window,
    onExceed: "block",
  },
];

function fixture(additionalBudgets: Budget[] = []) {
  const clock = createManualClock(occurredAt);
  const store = createMemoryStore({ clock, budgets: [...budgets, ...additionalBudgets] });
  const meter = createMeter({
    store,
    clock,
    resolveOwnership: async () => ({ kind: "principal", namespace: "test", principal: "owner" }),
  });
  mocks.runtime.mockResolvedValue({ store, clock, meter });
  return { store, meter, clock };
}

async function record(
  meter: Meter,
  id: string,
  group: string,
  unknown = false,
  receiptAt = occurredAt,
  principal = "owner",
) {
  const reserve = await meter.reserve({
    operationId: id,
    scope: {
      namespace: "test",
      principal,
      group,
      connection: group === "project" ? "connection" : "other-connection",
      tags: ["shared"],
    },
    fundingSource: principal === "old-owner" ? "platform" : "byok",
    ...(principal === "old-owner"
      ? { creditAccountRef: "private-old-wallet", customerPriceVersion: "old-price" }
      : {}),
    costOwner: "private-owner",
    surface: "app",
    source: "worker",
    provider: "DataForSEO",
    operation: "rank_check",
    estimate: [
      { unit: "cents", scale: 4, value: 10000n },
      { unit: "units", scale: 6, value: 1000000n },
    ],
  });
  if (reserve.outcome !== "reserved") throw new Error(`Reserve failed: ${reserve.outcome}`);
  const ref = { namespace: "test", principal, operationId: id };
  const grant = await meter.markDispatchIntent({
    ...ref,
    commandId: `dispatch:${id}`,
    expectedVersion: reserve.operation.version,
    holder: "worker",
    leaseTtlMs: 10000,
  });
  if (!("granted" in grant) || !grant.granted) throw new Error("Dispatch failed");
  const settled = await meter.settle({
    ...ref,
    commandId: `settle:${id}`,
    expectedVersion: grant.operation.version,
    authority: { kind: "lease", leaseId: grant.lease.leaseId },
    receipt: {
      id: `receipt:${id}`,
      occurredAt: receiptAt,
      recordedAt: receiptAt,
      cached: false,
      failed: false,
      cost: unknown
        ? { certainty: "unknown", money: null }
        : { certainty: "measured", money: { units: 10000n, currency: "USD" } },
      measurements: [
        ...(principal === "old-owner"
          ? [
              {
                unit: "customer_cents",
                certainty: "measured" as const,
                quantity: { unit: "customer_cents", value: 50000n, scale: 4 },
              },
            ]
          : []),
        {
          unit: "units",
          certainty: "measured",
          quantity: { unit: "units", value: 1000000n, scale: 6 },
        },
        unknown
          ? { unit: "cents", certainty: "unknown", quantity: null }
          : {
              unit: "cents",
              certainty: "measured",
              quantity: { unit: "cents", value: 10000n, scale: 4 },
            },
      ],
    },
  });
  if (settled.outcome !== "settled") throw new Error(`Settle failed: ${settled.outcome}`);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({
    actor: { id: "owner", memberships: [{ projectId: "project", role: "owner" }] },
    project: { id: "project", ownerId: "owner" },
  });
  mocks.connections.mockResolvedValue([
    { id: "connection", publicId: "prc_public", provider: "dataforseo" },
  ]);
  mocks.authority.mockResolvedValue({ mode: "legacy", coverage: "none", windows: [] });
  mocks.ownBudgets.mockResolvedValue(null);
});
afterEach(() => vi.useRealTimers());

describe("verified project Meter queries", () => {
  it("runs real scoped Meter reads, omits same-owner other-project usage, and includes source-specific limits once", async () => {
    const f = fixture();
    await record(f.meter, "project-op", "project");
    await record(f.meter, "other-op", "other-project");
    const usage = vi.spyOn(f.meter, "usage");
    const budget = vi.spyOn(f.meter, "applicableBudgets");
    const writes = vi.spyOn(f.store, "reserve");
    const data = await getProjectMeteringUsage("prj_public");
    expect(data).toMatchObject({
      status: "available",
      authority: "legacy",
      observed: true,
      unresolved: 0,
    });
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0]).toMatchObject({ providerCost: "0.010000", units: "1.000000" });
    expect(data.budgets).toHaveLength(2);
    expect(data.budgets.find((row) => row.surface === "worker")).toMatchObject({
      used: "1.000000",
      provider: "dataforseo",
      connection: "prc_public",
    });
    expect(usage).toHaveBeenCalledWith(
      expect.objectContaining({
        readablePrincipals: ["owner"],
        readableGroups: ["project"],
        readablePools: [],
        canManageBudgets: false,
      }),
      expect.objectContaining({ scope: { kind: "group", namespace: "test", group: "project" } }),
    );
    expect(budget.mock.calls.map(([, query]) => query.source)).toEqual([
      "app",
      "worker",
      "api",
      "sdk",
      "cli",
      "mcp",
      "proxy",
    ]);
    expect(mocks.connections).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: "project" }, take: 21 }),
    );
    expect(mocks.authority).toHaveBeenCalledWith({
      namespace: "test",
      connectionId: "connection",
      from: "2026-10-01T00:00:00.000Z",
      to: now,
    });
    expect(writes).not.toHaveBeenCalled();
    expect(JSON.stringify(data)).not.toMatch(/private-owner|shared-tag|project-op|other-op/);
  });
  it("does not label empty Meter coverage as zero, and preserves unknown costs and pending age", async () => {
    const f = fixture();
    expect(await getProjectMeteringUsage("prj_public")).toMatchObject({
      status: "available",
      observed: false,
      rows: [],
    });
    await record(f.meter, "pending-op", "project", true);
    expect(await getProjectMeteringUsage("prj_public")).toMatchObject({
      observed: true,
      unresolved: 1,
      oldestUnresolvedAt: occurredAt,
      rows: [
        expect.objectContaining({
          providerCost: null,
          certainty: "unknown",
          unknownOperations: "1",
        }),
      ],
    });
  });
  it("retains unresolved exposure from an earlier month even with no current-month observations", async () => {
    const f = fixture();
    f.clock.set("2026-09-30T10:00:00.000Z");
    await record(f.meter, "old-pending", "project", true, "2026-09-30T10:00:00.000Z");
    expect(await getProjectMeteringUsage("prj_public")).toMatchObject({
      observed: false,
      unresolved: 1,
      oldestUnresolvedAt: "2026-09-30T10:00:00.000Z",
    });
  });
  it("does not expose the previous owner's frozen wallet charges or pending operations after transfer", async () => {
    const f = fixture();
    await record(f.meter, "old-wallet-operation", "project", true, occurredAt, "old-owner");
    await record(f.meter, "new-owner-operation", "project");
    const data = await getProjectMeteringUsage("prj_public");
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0]).toMatchObject({ funding: "byok", providerCost: "0.010000" });
    expect(data.unresolved).toBe(0);
    expect(
      data.budgets.every(
        (budget) => budget.used === null && budget.reserved === null && budget.remaining === null,
      ),
    ).toBe(true);
    expect(JSON.stringify(data)).not.toMatch(/0\.050000|old-wallet|old-owner/);
    // Evidence stays retained for the original principal; a project display never rewrites it.
    const retained = await f.meter.getOperation(
      {
        namespace: "test",
        readablePrincipals: ["old-owner"],
        readableGroups: [],
        readablePools: [],
        canReadBillingDetail: true,
        canManageBudgets: false,
      },
      { namespace: "test", principal: "old-owner", operationId: "old-wallet-operation" },
    );
    expect(retained.outcome).toBe("ok");
    if (retained.outcome === "ok")
      expect(retained.value?.creditAccountRef).toBe("private-old-wallet");
  });
  it("does not present an unobserved connection budget as zero when another connection has usage", async () => {
    const emptyBudget: Budget = {
      ...budgets[1],
      id: "empty-connection-budget",
      scope: { kind: "connection", namespace: "test", connection: "other-connection" },
    };
    const f = fixture([emptyBudget]);
    await record(f.meter, "observed-operation", "project");
    mocks.connections.mockResolvedValue([
      { id: "connection", publicId: "prc_public", provider: "dataforseo" },
      { id: "other-connection", publicId: "prc_empty", provider: "serpapi" },
    ]);
    const data = await getProjectMeteringUsage("prj_public");
    expect(data.observed).toBe(true);
    expect(data.budgets.find((budget) => budget.connection === "prc_empty")).toMatchObject({
      provider: "serpapi",
      used: null,
      reserved: null,
      remaining: null,
    });
  });
  it.each(["member", "admin", "viewer", "auditor"])(
    "denies financial reads to a %s before touching Meter or authority storage",
    async (role) => {
      mocks.access.mockResolvedValue({
        actor: { id: "member", memberships: [{ projectId: "project", role }] },
        project: { id: "project", ownerId: "owner" },
      });
      expect(await getProjectMeteringUsage("prj_public")).toMatchObject({
        status: "restricted",
        rows: [],
        budgets: [],
      });
      expect(mocks.runtime).not.toHaveBeenCalled();
      expect(mocks.connections).not.toHaveBeenCalled();
      expect(mocks.authority).not.toHaveBeenCalled();
      expect(mocks.ownBudgets).not.toHaveBeenCalled();
    },
  );
  it("propagates project authorization failure and degrades observer failures without monetary data", async () => {
    mocks.access.mockRejectedValueOnce(new Error("Forbidden project"));
    await expect(getProjectMeteringUsage("prj_unknown")).rejects.toThrow("Forbidden project");
    expect(mocks.runtime).not.toHaveBeenCalled();
    mocks.runtime.mockRejectedValueOnce(new Error("Storage down"));
    expect(await getProjectMeteringUsage("prj_public")).toMatchObject({
      status: "unavailable",
      observed: false,
      rows: [],
      asOf: null,
    });
  });
  it("does not infer full-month authority from active current epochs or a truncated inventory", async () => {
    fixture();
    mocks.authority.mockResolvedValue({ mode: "active", coverage: "partial", windows: [] });
    expect(await getProjectMeteringUsage("prj_public")).toMatchObject({ authority: "mixed" });
    mocks.connections.mockResolvedValue(
      Array.from({ length: 21 }, (_, index) => ({
        id: `connection-${index}`,
        publicId: `prc_${index}`,
      })),
    );
    mocks.authority.mockResolvedValue({ mode: "active", coverage: "full", windows: [] });
    expect(await getProjectMeteringUsage("prj_public")).toMatchObject({
      authority: "unknown",
      truncated: true,
    });
  });
});
