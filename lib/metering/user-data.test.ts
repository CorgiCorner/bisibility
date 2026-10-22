import { loadWorkspaceBudgetSummary } from "@/lib/queries/workspace-budget-summary";
import type { Budget, Meter } from "@usagekit/core";
import { createMeter } from "@usagekit/meter";
import { createManualClock, createMemoryStore } from "@usagekit/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  connections: vi.fn(),
  primary: vi.fn(),
  runtime: vi.fn(),
  authority: vi.fn(),
  ownBudgets: vi.fn(),
  demo: vi.fn(),
}));
vi.mock("@/lib/demo/config", () => ({ readDemoConfig: mocks.demo }));
vi.mock("@/lib/queries/_auth", () => ({ requireReadableProject: mocks.access }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    providerConnection: { findFirst: mocks.primary, findMany: mocks.connections },
  },
}));
vi.mock("./runtime", () => ({ meteringNamespace: () => "test", meteringRuntime: mocks.runtime }));
vi.mock("./project-budget-read", () => ({ projectFundingStatuses: vi.fn(async () => []) }));
// Credits connection rows have their own suite (user-credits-budgets.test.ts).
vi.mock("./platform-budget-read", () => ({ readPlatformConnectionBudgets: vi.fn(async () => []) }));
vi.mock("@/lib/providers/execution-extension", () => ({
  readDeploymentMeteringAuthority: mocks.authority,
}));
vi.mock("./own-budget-read", () => ({ readOwnConnectionBudgets: mocks.ownBudgets }));

import { projectBudgetId, projectFundingBudget } from "./project-funding-budgets";
import { getProjectMeteringBudgets, getProjectMeteringUsage } from "./user-data";

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

function fixture(additionalBudgets: Budget[] = [], baseBudgets: Budget[] = budgets) {
  const clock = createManualClock(occurredAt);
  const store = createMemoryStore({ clock, budgets: [...baseBudgets, ...additionalBudgets] });
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
  mocks.demo.mockReturnValue({ kind: "disabled" });
  mocks.access.mockResolvedValue({
    actor: { id: "owner", memberships: [{ projectId: "project", role: "owner" }] },
    project: { id: "project", ownerId: "owner", name: "webscraping" },
  });
  mocks.connections.mockResolvedValue([
    { id: "connection", publicId: "prc_public", provider: "dataforseo" },
  ]);
  mocks.primary.mockResolvedValue(null);
  mocks.authority.mockResolvedValue({ mode: "legacy", coverage: "none", windows: [] });
  mocks.ownBudgets.mockResolvedValue(null);
});
afterEach(() => vi.useRealTimers());

describe("verified project Meter queries", () => {
  it("shows zero spending-cap counters and a full header remainder before the first operation", async () => {
    fixture(
      [],
      [
        {
          ...budgets[0],
          unit: "budget_cents",
          limit: { unit: "budget_cents", scale: 4, value: 50000000n },
        },
      ],
    );
    const data = await getProjectMeteringUsage("prj_public");
    expect(data).toMatchObject({
      status: "available",
      paidWorkBlocked: false,
      detail: { state: "empty", rows: [] },
      budgets: [
        {
          used: { text: "0" },
          reserved: { text: "0" },
          remaining: { text: "5000" },
          level: "ok",
        },
      ],
    });
    expect(await loadWorkspaceBudgetSummary("prj_public")).toMatchObject({
      eligible: true,
      paidWorkBlocked: false,
      status: { hidden: 0, bounds: [{ remaining: { text: "5000" }, level: "ok" }] },
    });
  });
  it("shows split project funding limits unredacted and hides the limitless group marker", async () => {
    const { projectFundingStatuses } = await import("./project-budget-read");
    const epoch = {
      epoch: "2026-10",
      startsAt: "2026-10-01T00:00:00.000Z",
      endsAt: "2026-11-01T00:00:00.000Z",
    };
    const zero = (unit: string) => ({ unit, scale: 4, value: 0n });
    const own: Budget = {
      ...projectFundingBudget("test", "project", "byok", "5000", 1),
      surface: "any",
    };
    const credits = projectFundingBudget("test", "project", "platform", null, 1);
    vi.mocked(projectFundingStatuses).mockResolvedValueOnce([
      {
        budget: own,
        epoch,
        used: zero("budget_cents"),
        reserved: zero("budget_cents"),
        remaining: { unit: "budget_cents", scale: 4, value: 50000000n },
      },
      {
        budget: credits,
        epoch,
        used: zero("customer_cents"),
        reserved: zero("customer_cents"),
        remaining: null,
      },
    ]);
    fixture(
      [],
      [{ ...budgets[0], id: projectBudgetId("project"), unit: "budget_cents", limit: null }],
    );
    const data = await getProjectMeteringUsage("prj_public");
    expect(data.status).toBe("available");
    const projectRows =
      data.status === "available" ? data.budgets.filter((row) => row.kind === "group") : [];
    expect(projectRows.map((row) => row.id).sort()).toEqual([
      "project:any:budget_cents",
      "project:any:customer_cents",
    ]);
    expect(projectRows.find((row) => row.unit === "budget_cents")).toMatchObject({
      remaining: { text: "5000" },
    });
    expect(projectRows.find((row) => row.unit === "customer_cents")).toMatchObject({
      limit: "unlimited",
    });
  });
  function exhaustedHostedConnection() {
    const openGroup: Budget = {
      ...budgets[0],
      id: projectBudgetId("project"),
      unit: "budget_cents",
      limit: { unit: "budget_cents", scale: 0, value: 5000n },
    };
    const hostedZero: Budget = {
      id: "hosted-zero",
      version: 1,
      scope: { kind: "connection", namespace: "test", connection: "hosted-connection" },
      surface: "any",
      unit: "budget_cents",
      limit: { unit: "budget_cents", scale: 0, value: 0n },
      window,
      onExceed: "block",
    };
    mocks.connections.mockResolvedValue([
      {
        id: "hosted-connection",
        publicId: "prc_hosted",
        provider: "serpapi",
        credentialSource: "hosted",
      },
      {
        id: "own-connection",
        publicId: "prc_own",
        provider: "dataforseo",
        credentialSource: "own",
      },
    ]);
    fixture([], [openGroup, hostedZero]);
  }
  it("blocks paid work from any connection while the project is unsplit", async () => {
    exhaustedHostedConnection();
    expect(await getProjectMeteringBudgets("prj_public")).toMatchObject({
      status: "available",
      paidWorkBlocked: true,
    });
    expect(mocks.primary).not.toHaveBeenCalled();
  });
  it("blocks paid work from the primary SERP connection once the project is split", async () => {
    const { projectFundingStatuses } = await import("./project-budget-read");
    const epoch = {
      epoch: "2026-10",
      startsAt: "2026-10-01T00:00:00.000Z",
      endsAt: "2026-11-01T00:00:00.000Z",
    };
    const zero = { unit: "budget_cents", scale: 4, value: 0n };
    vi.mocked(projectFundingStatuses).mockResolvedValueOnce([
      {
        budget: { ...projectFundingBudget("test", "project", "byok", "5000", 1), surface: "any" },
        epoch,
        used: zero,
        reserved: zero,
        remaining: { unit: "budget_cents", scale: 4, value: 50000000n },
      },
    ]);
    mocks.primary.mockResolvedValue({
      id: "own-connection",
      credentialSource: "own",
      provider: "dataforseo",
      rates: [],
    });
    exhaustedHostedConnection();
    expect(await getProjectMeteringBudgets("prj_public")).toMatchObject({
      status: "available",
      paidWorkBlocked: false,
    });
  });
  it("runs real scoped Meter reads, omits same-owner other-project usage, and includes source-specific limits once", async () => {
    const f = fixture();
    await record(f.meter, "project-op", "project");
    await record(f.meter, "other-op", "other-project");
    const usage = vi.spyOn(f.meter, "usage");
    const budget = vi.spyOn(f.meter, "applicableBudgets");
    const writes = vi.spyOn(f.store, "reserve");
    const data = await getProjectMeteringUsage("prj_public");
    expect(data.status).toBe("available");
    expect(data.summary.complete).toBe(true);
    expect(data.detail.groupBy).toEqual(["connection", "provider", "surface", "source"]);
    expect(data.detail.rows).toHaveLength(1);
    expect(data.detail.rows[0].cost).toMatchObject({ text: "1.0000", certainty: "measured" });
    expect(data.budgets).toHaveLength(2);
    expect(data.budgets.find((row) => row.unit === "units")?.used).toMatchObject({ text: "1" });
    expect(usage).toHaveBeenCalledWith(
      expect.objectContaining({
        readablePrincipals: ["owner"],
        readableGroups: ["project"],
        readablePools: [],
        canManageBudgets: false,
      }),
      expect.objectContaining({ scope: { kind: "group", namespace: "test", group: "project" } }),
    );
    expect(budget.mock.calls.slice(0, 7).map(([, query]) => query.source)).toEqual([
      "app",
      "worker",
      "api",
      "sdk",
      "cli",
      "mcp",
      "proxy",
    ]);
    expect(mocks.connections).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: "project" }, take: 50 }),
    );
    expect(writes).not.toHaveBeenCalled();
    expect(JSON.stringify(data)).not.toMatch(/private-owner|shared-tag|project-op|other-op/);
  });
  it("does not label empty Meter coverage as zero, and preserves unknown costs and pending age", async () => {
    const f = fixture();
    expect(await getProjectMeteringUsage("prj_public")).toMatchObject({
      status: "available",
      detail: { state: "empty", rows: [] },
    });
    await record(f.meter, "pending-op", "project", true);
    expect(await getProjectMeteringUsage("prj_public")).toMatchObject({
      unresolved: 1,
      oldestUnresolvedAt: occurredAt,
      detail: {
        rows: [
          expect.objectContaining({
            cost: { text: "", unit: "cents", certainty: "unknown" },
            unknownOperations: "1",
          }),
        ],
      },
    });
  });
  it("retains unresolved exposure from an earlier month even with no current-month observations", async () => {
    const f = fixture();
    f.clock.set("2026-09-30T10:00:00.000Z");
    await record(f.meter, "old-pending", "project", true, "2026-09-30T10:00:00.000Z");
    expect(await getProjectMeteringUsage("prj_public")).toMatchObject({
      unresolved: 1,
      oldestUnresolvedAt: "2026-09-30T10:00:00.000Z",
    });
  });
  it("does not expose the previous owner's frozen wallet charges or pending operations after transfer", async () => {
    const f = fixture();
    await record(f.meter, "old-wallet-operation", "project", true, occurredAt, "old-owner");
    await record(f.meter, "new-owner-operation", "project");
    const data = await getProjectMeteringUsage("prj_public");
    expect(data.detail.rows).toHaveLength(1);
    expect(data.detail.rows[0]).toMatchObject({
      fundingSource: "byok",
      cost: { text: "1.0000", unit: "cents", certainty: "measured" },
    });
    expect(data.unresolved).toBe(0);
    expect(
      data.budgets.every(
        (budget) =>
          budget.used === "unavailable" &&
          budget.reserved === "unavailable" &&
          budget.remaining === "unavailable",
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
    expect(data.summary.state).toBe("ok");
    expect(data.budgets.find((budget) => budget.id.startsWith("prc_empty:"))).toMatchObject({
      target: "SerpApi · webscraping",
      used: "unavailable",
      reserved: "unavailable",
      remaining: "unavailable",
    });
  });
  it.each(["member", "admin", "viewer", "auditor"])(
    "denies financial detail reads to a %s while permitting the blocking signal",
    async (role) => {
      fixture();
      mocks.access.mockResolvedValue({
        actor: { id: "member", memberships: [{ projectId: "project", role }] },
        project: { id: "project", ownerId: "owner", name: "webscraping" },
      });
      expect(await getProjectMeteringUsage("prj_public")).toMatchObject({
        status: "restricted",
        detail: { rows: [] },
        budgets: [],
      });
      expect(mocks.connections).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
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
      detail: { state: "unavailable", rows: [] },
    });
  });
  it("reports uniform authority and preserves incomplete inventory visibility", async () => {
    fixture();
    mocks.authority.mockResolvedValue({ mode: "active", coverage: "partial", windows: [] });
    expect((await getProjectMeteringUsage("prj_public")).summary.complete).toBe(true);
    mocks.connections.mockResolvedValue(
      Array.from({ length: 21 }, (_, index) => ({
        id: `connection-${index}`,
        publicId: `prc_${index}`,
      })),
    );
    mocks.authority.mockResolvedValue({ mode: "active", coverage: "full", windows: [] });
    expect(await getProjectMeteringUsage("prj_public")).toMatchObject({
      truncated: true,
    });
  });
});
it("keeps current project constraints visible after the final connection is deleted", async () => {
  const f = fixture();
  await record(f.meter, "retained-project-use", "project");
  mocks.connections.mockResolvedValue([]);
  const data = await getProjectMeteringUsage("prj_public");
  expect(data.budgets.some((row) => row.kind === "group")).toBe(true);
  expect(data.detail.rows[0].dimensions.connection).toBe("");
});
it("uses a complete hypothetical operation scope to observe a connectionless project budget", async () => {
  const f = fixture();
  const reads = vi.spyOn(f.meter, "applicableBudgets");
  mocks.connections.mockResolvedValue([]);
  await getProjectMeteringUsage("prj_public");
  expect(reads).toHaveBeenCalled();
  for (const [, query] of reads.mock.calls)
    expect(query.scope.connection).toEqual(expect.any(String));
});

it.each(["restricted admin", "Meter failure", "21st connection"])(
  "retains the authorized budget editor inventory for %s",
  async (scenario) => {
    fixture();
    const connections = Array.from({ length: 50 }, (_, index) => ({
      id: `connection-${index}`,
      publicId: `prc_${index}`,
      provider: "serpapi",
    }));
    mocks.connections.mockResolvedValue(connections);
    if (scenario === "restricted admin")
      mocks.access.mockResolvedValue({
        actor: { id: "admin", memberships: [{ projectId: "project", role: "admin" }] },
        project: { id: "project", ownerId: "owner", name: "webscraping" },
      });
    if (scenario === "Meter failure")
      mocks.runtime.mockRejectedValue(new Error("private failure detail"));
    const data = await getProjectMeteringUsage("prj_public");
    expect(data.connections).toHaveLength(50);
    expect(data.connections[20]).toEqual({ connectionId: "prc_20", provider: "serpapi" });
    expect(mocks.connections).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
    expect(JSON.stringify(data.connections)).not.toContain("connection-20");
  },
);
it("logs a content-free failure while keeping the observer unavailable", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    mocks.runtime.mockRejectedValue(new Error("private failure detail"));
    expect((await getProjectMeteringUsage("prj_public")).status).toBe("unavailable");
    expect(log).toHaveBeenCalledWith("[metering] project usage unavailable");
    expect(JSON.stringify(log.mock.calls)).not.toContain("private failure detail");
  } finally {
    log.mockRestore();
  }
});
it.each(["member", "owner"])(
  "returns only the blocking signal to a %s despite incomplete provenance",
  async (role) => {
    const f = fixture([
      {
        ...budgets[1],
        id: "one-request",
        unit: "requests",
        scope: { kind: "group", namespace: "test", group: "project" },
        surface: "any",
        limit: { unit: "requests", scale: 0, value: 1n },
      },
    ]);
    const reservation = await f.meter.reserve({
      operationId: "blocked-reservation",
      scope: {
        namespace: "test",
        principal: "owner",
        group: "project",
        connection: "connection",
      },
      fundingSource: "byok",
      costOwner: "owner",
      source: "app",
      surface: "app",
      provider: "serpapi",
      operation: "rank_check",
      estimate: [
        { unit: "requests", scale: 0, value: 1n },
        { unit: "cents", scale: 4, value: 0n },
        { unit: "units", scale: 6, value: 0n },
      ],
    });
    expect(reservation).toMatchObject({ outcome: "reserved" });
    if (role === "member")
      mocks.access.mockResolvedValue({
        actor: { id: "member", memberships: [{ projectId: "project", role: "member" }] },
        project: { id: "project", ownerId: "owner", name: "webscraping" },
      });
    const reads = vi.spyOn(f.meter, "listOperations");
    if (role === "owner")
      reads.mockResolvedValue({
        outcome: "ok",
        value: {
          operations: [],
          nextCursor: "more",
          asOf: now,
          watermark: null,
        },
      } as never);
    const data = await getProjectMeteringUsage("prj_public");
    expect(data).toHaveProperty("paidWorkBlocked", true);
    if (role === "member") {
      expect(data.budgets).toEqual([]);
      expect(data.detail.rows).toEqual([]);
      expect(reads).not.toHaveBeenCalled();
      expect(JSON.stringify(data)).not.toMatch(/one-request|blocked-reservation/);
    } else expect(data.budgets.every((row) => row.level === "unavailable")).toBe(true);
  },
);

it.each(["owner", "member"])(
  "keeps incomplete allocation coverage unknown for %s",
  async (role) => {
    fixture();
    mocks.connections.mockResolvedValue(
      Array.from({ length: 21 }, (_, index) => ({
        id: `connection-${index}`,
        publicId: `prc_${index}`,
        provider: "serpapi",
      })),
    );
    mocks.access.mockResolvedValue({
      actor: { id: role, memberships: [{ projectId: "project", role }] },
      project: { id: "project", ownerId: "owner", name: "webscraping" },
    });
    expect(await getProjectMeteringUsage("prj_public")).toMatchObject({
      paidWorkBlocked: null,
      truncated: true,
    });
  },
);
it("keeps current connection labels beyond the budget scan limit", async () => {
  const f = fixture();
  await record(f.meter, "current-operation", "project");
  mocks.connections.mockResolvedValue([
    ...Array.from({ length: 20 }, (_, index) => ({
      id: `c-${index}`,
      publicId: `prc_${index}`,
      provider: "serpapi",
    })),
    { id: "connection", publicId: "prc_current", provider: "dataforseo" },
  ]);
  const data = await getProjectMeteringUsage("prj_public");
  expect(data.detail.rows[0].dimensions.connection).toBe("prc_current");
});

it("resolves current usage connections outside the capped inventory within the project", async () => {
  const f = fixture();
  await record(f.meter, "current-outside-inventory", "project");
  mocks.connections.mockImplementation(async (query) =>
    query.where.id
      ? [{ id: "connection", publicId: "prc_current", provider: "dataforseo" }]
      : Array.from({ length: 50 }, (_, index) => ({
          id: `c-${index}`,
          publicId: `prc_${index}`,
          provider: "serpapi",
        })),
  );
  const data = await getProjectMeteringUsage("prj_public");
  expect(data.detail.rows[0].dimensions.connection).toBe("prc_current");
  expect(mocks.connections).toHaveBeenCalledWith({
    where: { projectId: "project", id: { in: ["connection"] } },
    select: { id: true, publicId: true },
  });
});

it("preserves confirmed budgets and a proven block when the usage read fails", async () => {
  const f = fixture([
    {
      ...budgets[0],
      id: "zero-request-budget",
      unit: "requests",
      limit: { unit: "requests", scale: 0, value: 0n },
    },
  ]);
  const confirmed = await getProjectMeteringBudgets("prj_public");
  expect(confirmed.paidWorkBlocked).toBe(true);
  expect(confirmed.budgets.length).toBeGreaterThan(0);
  vi.spyOn(f.meter, "usage").mockRejectedValue(new Error("usage unavailable"));
  const result = await getProjectMeteringUsage("prj_public");
  expect(result).toMatchObject({
    status: "unavailable",
    paidWorkBlocked: true,
    budgets: confirmed.budgets,
    connections: confirmed.connections,
    summary: { state: "unavailable", complete: false },
    detail: { state: "unavailable", rows: [] },
  });
});

it("uses serial header reads without changing the full budget projection", async () => {
  const { meter } = fixture();
  const original = meter.applicableBudgets.bind(meter);
  let active = 0;
  let peak = 0;
  const reads = vi.spyOn(meter, "applicableBudgets").mockImplementation(async (...args) => {
    active++;
    peak = Math.max(peak, active);
    await Promise.resolve();
    try {
      return await original(...args);
    } finally {
      active--;
    }
  });
  const standard = await getProjectMeteringBudgets("prj_public");
  expect(peak).toBe(4);
  const requests = structuredClone(reads.mock.calls);
  reads.mockClear();
  peak = 0;
  const header = await getProjectMeteringBudgets("prj_public", "header");
  expect(peak).toBe(1);
  expect(header).toEqual(standard);
  expect(reads.mock.calls).toEqual(requests);
});

it.each(["active", "migration_hold", "migrated"])(
  "derives owner budget controls from the current project write mode: %s",
  async (writeMode) => {
    mocks.access.mockResolvedValue({
      actor: { id: "owner", memberships: [{ projectId: "project", role: "owner" }] },
      project: { id: "project", ownerId: "owner", name: "webscraping", writeMode },
    });
    const data = await getProjectMeteringBudgets("prj_public");
    expect(data.canEditBudget).toBe(writeMode === "active");
  },
);

it.each(
  ["disabled", "editable", "legacy-read-only"].flatMap((kind) =>
    ["owner", "viewer"].flatMap((role) =>
      ["active", "migration_hold", "migrated"].map((writeMode) => ({ kind, role, writeMode })),
    ),
  ),
)(
  "keeps budget editing scoped to $kind / $role / $writeMode",
  async ({ kind, role, writeMode }) => {
    mocks.demo.mockReturnValue({ kind });
    mocks.access.mockResolvedValue({
      actor: { id: "owner", memberships: [{ projectId: "project", role }] },
      project: { id: "project", ownerId: "owner", name: "webscraping", writeMode },
    });
    const data = await getProjectMeteringBudgets("prj_public", "header");
    expect(data.canEditBudget).toBe(
      kind === "disabled" && role === "owner" && writeMode === "active",
    );
    if (role === "viewer") expect(data.status).toBe("restricted");
  },
);
