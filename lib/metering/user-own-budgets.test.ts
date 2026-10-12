import { ownAllocationTag } from "@/lib/provider-usage/credential-version";
import type { AccessContext, Budget, Meter } from "@usagekit/core";
import { createMeter } from "@usagekit/meter";
import { createManualClock, createMemoryStore } from "@usagekit/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OwnBudgetRead } from "./own-budget-read-types";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  connections: vi.fn(),
  runtime: vi.fn(),
  own: vi.fn(),
}));
vi.mock("@/lib/queries/_auth", () => ({ requireReadableProject: mocks.auth }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { providerConnection: { findMany: mocks.connections } },
}));
vi.mock("./runtime", () => ({ meteringNamespace: () => "n", meteringRuntime: mocks.runtime }));
vi.mock("./own-budget-read", () => ({ readOwnConnectionBudgets: mocks.own }));
vi.mock("@/lib/providers/execution-extension", () => ({
  readDeploymentMeteringAuthority: async () => ({ mode: "legacy", coverage: "none", windows: [] }),
}));

import { getProjectMeteringUsage } from "./user-data";

const now = "2026-10-06T12:00:00.000Z",
  connection = "private-connection",
  publicConnection = "conn_abcdefghijklmnopqrstuvwx";
const tag = ownAllocationTag("dataforseo", connection);
const budget: Budget = {
  id: `own-connection:${connection}:app`,
  version: 1,
  scope: { kind: "tag", namespace: "n", tag },
  surface: "app",
  unit: "cents",
  limit: { unit: "cents", scale: 4, value: 1000000n },
  window: { kind: "calendar_month", timezone: "UTC" },
  onExceed: "block",
};
const access: AccessContext = {
  namespace: "n",
  readablePrincipals: ["owner"],
  readableGroups: ["private-project"],
  readablePools: [],
  canReadBillingDetail: true,
  canManageBudgets: false,
};
const query = {
  scope: { namespace: "n", principal: "owner", group: "private-project", connection, tags: [tag] },
  surface: "app" as const,
  units: ["cents"],
};
let read: OwnBudgetRead;

beforeEach(async () => {
  vi.resetAllMocks();
  vi.setSystemTime(now);
  mocks.auth.mockResolvedValue({
    actor: { id: "owner", memberships: [{ projectId: "private-project", role: "owner" }] },
    project: { id: "private-project", ownerId: "owner" },
  });
  mocks.connections.mockResolvedValue([
    { id: connection, publicId: publicConnection, provider: "dataforseo" },
  ]);
  const clock = createManualClock(now),
    store = createMemoryStore({ clock, budgets: [budget] });
  const meter = createMeter({
    store,
    clock,
    resolveOwnership: async () => ({ kind: "principal", namespace: "n", principal: "owner" }),
  });
  mocks.runtime.mockResolvedValue({ store, meter, clock });
  const statuses = await store.applicableBudgets(query);
  read = {
    binding: {
      namespace: "n",
      principal: "owner",
      group: "private-project",
      connection,
      publicConnection,
      provider: "dataforseo",
      tag,
      credentialVersion: "private-version",
      unit: "cents",
    },
    budgets: statuses.map((status) => ({ status, figuresKnown: true })),
  };
  mocks.own.mockResolvedValue(read);
});
afterEach(() => vi.useRealTimers());

describe("owner BYOK budget projection", () => {
  it("keeps detail reads owner-scoped and shared admission decisions out of the DTO", async () => {
    const { meter } = (await mocks.runtime()) as { meter: Meter };
    const direct = await meter.applicableBudgets(access, query);
    expect(direct.outcome).toBe("ok");
    if (direct.outcome === "ok")
      expect(direct.value[0]).toMatchObject({
        redacted: true,
        used: null,
        reserved: null,
        remaining: null,
      });
    const applicable = vi.spyOn(meter, "applicableBudgets"),
      usage = vi.spyOn(meter, "usage");
    const data = await getProjectMeteringUsage("prj_public");
    expect(data.budgets).toMatchObject([
      expect.objectContaining({
        target: publicConnection,
        kind: "connection",
        used: expect.objectContaining({ text: "0" }),
        limit: expect.objectContaining({ text: "100" }),
      }),
    ]);
    for (const [passed] of usage.mock.calls) expect(passed).toEqual(access);
    for (const [passed, scope] of applicable.mock.calls) {
      expect(passed).toEqual({ ...access, readablePrincipals: passed.readablePrincipals });
      if (passed.readablePrincipals === "*") {
        expect(scope.scope.group).toBe("private-project");
        expect(scope.scope.connection).toBe(connection);
        expect(scope.scope.tags).toContain(tag);
      } else expect(passed.readablePrincipals).toEqual(["owner"]);
    }
    expect(JSON.stringify(data)).not.toMatch(
      new RegExp(`${tag}|private-connection|private-project|private-version|owner|own-connection`),
    );
    expect(mocks.own).toHaveBeenCalledWith({
      namespace: "n",
      actorId: "owner",
      projectId: "private-project",
      connectionId: connection,
    });
  });
  it("keeps unproven figures unknown while retaining only public native limit metadata", async () => {
    mocks.own.mockResolvedValue({
      ...read,
      budgets: read.budgets.map((row) => ({ ...row, figuresKnown: false })),
    });
    const data = await getProjectMeteringUsage("prj_public");
    expect(data.budgets[0]).toMatchObject({
      used: "unavailable",
      reserved: "unavailable",
      remaining: "unavailable",
      limit: expect.objectContaining({ text: "100" }),
    });
  });
  it("prefers the verified native tag bound over legacy native duplicates and preserves customer_cents", async () => {
    const clock = createManualClock(now);
    const legacy: Budget = {
      ...budget,
      id: "legacy-native",
      scope: { kind: "connection", namespace: "n", connection },
    };
    const customer: Budget = {
      ...legacy,
      id: "host-customer",
      unit: "customer_cents",
      limit: { unit: "customer_cents", value: 10n, scale: 4 },
    };
    const store = createMemoryStore({ clock, budgets: [budget, legacy, customer] });
    const meter = createMeter({
      store,
      clock,
      resolveOwnership: async () => ({ kind: "principal", namespace: "n", principal: "owner" }),
    });
    mocks.runtime.mockResolvedValue({ store, meter, clock });
    const data = await getProjectMeteringUsage("prj_public");
    expect(data.budgets.filter((row) => row.unit === "cents")).toHaveLength(1);
    expect(data.budgets.filter((row) => row.unit === "customer_cents")).toHaveLength(1);
  });
  it.each([
    { namespace: "other" },
    { principal: "old-owner" },
    { group: "other-project" },
    { connection: "other-connection" },
    { publicConnection: "conn_zyxwvutsrqponmlkjihgfedc" },
    { provider: "serpapi" },
  ])("refuses mismatched verification metadata %j", async (change) => {
    mocks.own.mockResolvedValue({ ...read, binding: { ...read.binding, ...change } });
    expect((await getProjectMeteringUsage("prj_public")).budgets).toEqual([]);
  });
  it.each(["member", "admin", "viewer", "auditor"])(
    "denies the %s role even with a spoofed owner identity",
    async (role) => {
      mocks.auth.mockResolvedValue({
        actor: { id: "owner", memberships: [{ projectId: "private-project", role }] },
        project: { id: "private-project", ownerId: "owner" },
      });
      const data = await getProjectMeteringUsage("prj_public");
      expect(data).toMatchObject({ status: "restricted", budgets: [], detail: { rows: [] } });
      expect(mocks.own).not.toHaveBeenCalled();
      expect(mocks.connections).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
    },
  );
  it("omits redacted or unrelated shared tags even from the trusted port", async () => {
    for (const status of [
      { ...read.budgets[0]?.status, redacted: true },
      {
        ...read.budgets[0]?.status,
        budget: { ...budget, scope: { kind: "tag", namespace: "n", tag: "unrelated" } },
      },
    ]) {
      mocks.own.mockResolvedValue({ ...read, budgets: [{ status, figuresKnown: true }] });
      expect((await getProjectMeteringUsage("prj_public")).budgets).toEqual([]);
    }
  });
  it("degrades read failure safely", async () => {
    mocks.own.mockRejectedValue(new Error("private DB details"));
    expect(await getProjectMeteringUsage("prj_public")).toMatchObject({
      status: "unavailable",
      budgets: [],
      detail: { rows: [] },
    });
  });
});

it.each(["owner", "member"])(
  "reports a blocking tag allocation to %s without exposing shared figures",
  async (role) => {
    const { meter } = (await mocks.runtime()) as { meter: Meter };
    const reserved = await meter.reserve({
      operationId: "reserved-tag-budget",
      scope: query.scope,
      fundingSource: "byok",
      costOwner: "owner",
      surface: "app",
      source: "app",
      provider: "dataforseo",
      operation: "rank_check",
      estimate: [{ unit: "cents", scale: 4, value: 1000000n }],
    });
    expect(reserved.outcome).toBe("reserved");
    mocks.auth.mockResolvedValue({
      actor: { id: role, memberships: [{ projectId: "private-project", role }] },
      project: { id: "private-project", ownerId: "owner" },
    });
    const data = await getProjectMeteringUsage("prj_public");
    expect(data.paidWorkBlocked).toBe(true);
    if (role === "member") {
      expect(data.budgets).toEqual([]);
      expect(data.summary.funding).toEqual([]);
      expect(data.detail.rows).toEqual([]);
    }
    expect(JSON.stringify(data)).not.toContain(tag);
  },
);
