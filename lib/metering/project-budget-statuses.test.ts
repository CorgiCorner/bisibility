import type { AccessContext, Budget, BudgetStatus } from "@usagekit/core";
import { createMeter } from "@usagekit/meter";
import { createMemoryStore } from "@usagekit/store";
import { expect, it, vi } from "vitest";
import { paidWorkBlocked, readProjectBudgetStatuses } from "./project-budget-statuses";

const project = { id: "project", ownerId: "owner" };
const access: AccessContext = {
  namespace: "test",
  readablePrincipals: [project.ownerId],
  readableGroups: [project.id],
  readablePools: [],
  canReadBillingDetail: true,
  canManageBudgets: false,
};
const clock = { now: () => new Date("2026-10-11T12:00:00.000Z") };
function projectCap(): Budget {
  return {
    id: "project:project:monthly",
    version: 1,
    scope: { kind: "group", namespace: "test", group: project.id },
    surface: "any",
    unit: "budget_cents",
    limit: { unit: "budget_cents", value: 100n, scale: 0 },
    window: { kind: "calendar_month", timezone: "UTC" },
    onExceed: "block",
  };
}
function unresolvedGate(): Budget {
  return {
    ...projectCap(),
    id: "unresolved:project",
    unit: "paid_attempts",
    limit: { unit: "paid_attempts", value: 0n, scale: 0 },
    window: {
      kind: "since_reset",
      epoch: "accounting-history",
      startsAt: "2026-10-01T00:00:00.000Z",
    },
  };
}
function fixture(budgets: Budget[]) {
  return createMeter({
    clock,
    store: createMemoryStore({ clock, budgets }),
    resolveOwnership: async () => ({
      kind: "principal",
      namespace: "test",
      principal: project.ownerId,
    }),
  });
}

it("retains the project monetary cap even without a provider connection", async () => {
  const meter = fixture([projectCap()]);
  const reads = vi.spyOn(meter, "applicableBudgets");
  const results = await readProjectBudgetStatuses(meter, access, project, []);
  expect(results).toHaveLength(7);
  for (const result of results) {
    expect(result.blocked).toBe(false);
    expect(result.statuses).toHaveLength(1);
    expect(result.statuses[0]).toMatchObject({
      budget: { id: "project:project:monthly", unit: "budget_cents", limit: projectCap().limit },
      remaining: { unit: "budget_cents", value: 100n, scale: 0 },
      epoch: { endsAt: "2026-11-01T00:00:00.000Z" },
    });
  }
  // ApplicableBudgetsQuery documents unit-specific matching, even though current
  // memory/Postgres stores also return applicable budgets outside this list.
  for (const [, query] of reads.mock.calls)
    expect(query.units).toEqual(expect.arrayContaining(["budget_cents", "paid_attempts"]));
});

it("retains a nonmonetary unresolved gate and blocks despite an available monetary cap", async () => {
  const results = await readProjectBudgetStatuses(
    fixture([projectCap(), unresolvedGate()]),
    access,
    project,
    [],
  );
  for (const result of results) {
    expect(result.blocked).toBe(true);
    expect(result.statuses).toHaveLength(2);
    expect(result.statuses.find((status) => status.budget.unit === "paid_attempts")).toMatchObject({
      budget: { unit: "paid_attempts", window: { kind: "since_reset" } },
      remaining: { unit: "paid_attempts", value: 0n, scale: 0 },
    });
    expect(
      result.statuses.find((status) => status.budget.unit === "paid_attempts")?.epoch.endsAt,
    ).toBeNull();
  }
});

it("does not synthesize a zero cap or exhaustion for a missing budget", async () => {
  const results = await readProjectBudgetStatuses(fixture([]), access, project, []);
  expect(results.every((result) => result.statuses.length === 0 && !result.blocked)).toBe(true);
});

it("preserves unknown figures instead of treating them as numeric exhaustion", async () => {
  const meter = fixture([]);
  const unknown: BudgetStatus = {
    budget: projectCap(),
    epoch: {
      epoch: "2026-10",
      startsAt: "2026-10-01T00:00:00.000Z",
      endsAt: "2026-11-01T00:00:00.000Z",
    },
    used: null,
    reserved: null,
    remaining: null,
  };
  vi.spyOn(meter, "applicableBudgets").mockResolvedValue({ outcome: "ok", value: [unknown] });
  const results = await readProjectBudgetStatuses(meter, access, project, []);
  expect(results.every((result) => result.blocked === null && result.statuses[0] === unknown)).toBe(
    true,
  );
});

it("recognizes numeric exhaustion without changing its monetary unit or reset", () => {
  const exhausted: BudgetStatus = {
    budget: projectCap(),
    epoch: {
      epoch: "2026-10",
      startsAt: "2026-10-01T00:00:00.000Z",
      endsAt: "2026-11-01T00:00:00.000Z",
    },
    used: { unit: "budget_cents", value: 90n, scale: 0 },
    reserved: { unit: "budget_cents", value: 10n, scale: 0 },
    remaining: { unit: "budget_cents", value: 0n, scale: 0 },
  };
  expect(paidWorkBlocked([exhausted])).toBe(true);
  expect(exhausted.budget.unit).toBe("budget_cents");
  expect(exhausted.epoch.endsAt).toBe("2026-11-01T00:00:00.000Z");
});

it("a proven block dominates unknown figures, while an unlimited bound is not unknown", () => {
  const unknown: BudgetStatus = {
    budget: projectCap(),
    epoch: { epoch: "2026-10", startsAt: "2026-10-01T00:00:00.000Z", endsAt: null },
    used: null,
    reserved: null,
    remaining: null,
  };
  const blocked = {
    ...unknown,
    budget: unresolvedGate(),
    used: { unit: "paid_attempts", value: 0n, scale: 0 },
    reserved: { unit: "paid_attempts", value: 0n, scale: 0 },
  };
  expect(paidWorkBlocked([unknown])).toBeNull();
  expect(paidWorkBlocked([unknown, blocked])).toBe(true);
  expect(paidWorkBlocked([{ ...unknown, budget: { ...unknown.budget, limit: null } }])).toBe(false);
});

it("reports allow-budget hard limits enforced by real Meter admission", async () => {
  const budget: Budget = {
    ...projectCap(),
    unit: "requests",
    onExceed: "allow",
    limit: { unit: "requests", scale: 0, value: 1n },
    hardLimit: { unit: "requests", scale: 0, value: 2n },
  };
  const meter = fixture([budget]);
  const request = {
    operationId: "first",
    scope: { namespace: "test", principal: "owner", group: "project", connection: "c" },
    fundingSource: "byok" as const,
    costOwner: "owner",
    source: "app" as const,
    surface: "app" as const,
    provider: "test",
    operation: "call",
    estimate: [{ unit: "requests", scale: 0, value: 2n }],
  };
  expect(await meter.reserve(request)).toMatchObject({ outcome: "reserved" });
  expect(
    await meter.reserve({
      ...request,
      operationId: "second",
      estimate: [{ unit: "requests", scale: 0, value: 1n }],
    }),
  ).toMatchObject({ outcome: "exceeded", exceeded: { boundary: "hardLimit" } });
  const results = await readProjectBudgetStatuses(meter, access, project, []);
  expect(results.every((result) => result.blocked === true)).toBe(true);
});
it("keeps allow hard-limit uncertainty distinct from advisory limits and proven blocks", () => {
  const status: BudgetStatus = {
    budget: {
      ...projectCap(),
      onExceed: "allow",
      hardLimit: { unit: "budget_cents", scale: 0, value: 200n },
    },
    epoch: { epoch: "e", startsAt: "2026-10-01T00:00:00Z", endsAt: null },
    used: null,
    reserved: null,
    remaining: null,
  };
  expect(paidWorkBlocked([status])).toBeNull();
  expect(paidWorkBlocked([{ ...status, budget: { ...status.budget, hardLimit: undefined } }])).toBe(
    false,
  );
  const known = {
    ...status,
    used: { unit: "budget_cents", scale: 0, value: 200n },
    reserved: { unit: "budget_cents", scale: 0, value: 0n },
  };
  expect(paidWorkBlocked([status, known])).toBe(true);
  expect(paidWorkBlocked([{ ...known, used: { ...known.used, value: 150n } }])).toBe(false);
});
