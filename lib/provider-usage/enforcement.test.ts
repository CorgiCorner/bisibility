import type { Budget, BudgetScope } from "@usagekit/core";
import { beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({ budgets: [] as Budget[], used: 0, reserved: 0, source: "own" }));
vi.mock("@/lib/metering/store/budgets", () => ({
  currentBudgets: async (
    _sql: unknown,
    _namespace: string,
    scopes: BudgetScope[],
    surface: string,
  ) =>
    state.budgets.filter(
      (b) =>
        scopes.some((s) => JSON.stringify(s) === JSON.stringify(b.scope)) &&
        (b.surface === "any" || b.surface === surface),
    ),
  status: async (_sql: unknown, b: Budget) => ({
    used: { value: BigInt(state.used), scale: 0 },
    reserved: { value: BigInt(state.reserved), scale: 0 },
    remaining: b.limit
      ? {
          ...b.limit,
          value: b.limit.value - BigInt(state.used + state.reserved) * 10n ** BigInt(b.limit.scale),
        }
      : null,
    epoch: { endsAt: "2026-11-01T00:00:00Z" },
  }),
}));

import { platformAllocationTag } from "@/lib/metering/paid-quote";
import { meteringNamespace } from "@/lib/metering/runtime";
import { ownAllocationTag } from "./credential-version";
import { assertProviderAllocationAvailable } from "./enforcement";

const db = {
  $queryRaw: vi.fn(),
  project: { findUnique: async () => ({ ownerId: "owner" }) },
  providerConnection: { findFirst: async () => ({ credentialSource: state.source }) },
};
const input = {
  catalog: [],
  connectionId: "c",
  projectId: "p",
  provider: "serpapi",
  estimatedCostCents: 2,
  estimatedUsageQuantity: 1,
  surface: "app" as const,
};
const budget = (
  scope: BudgetScope,
  unit: string,
  limit: bigint | null,
  surface: Budget["surface"] = "any",
): Budget => ({
  id: "fixture",
  version: 1,
  scope,
  unit,
  limit: limit === null ? null : { unit, value: limit, scale: 0 },
  surface,
  window: { kind: "calendar_month", timezone: "UTC" },
  onExceed: "block",
});
beforeEach(() => {
  state.budgets = [];
  state.used = 0;
  state.reserved = 0;
  state.source = "own";
});
test("project cap constrains a connection even with ample connection headroom", async () => {
  const namespace = meteringNamespace();
  state.budgets = [
    budget({ kind: "group", namespace, group: "p" }, "budget_cents", 1n),
    budget({ kind: "tag", namespace, tag: ownAllocationTag("serpapi", "c") }, "units", 100n),
  ];
  await expect(assertProviderAllocationAvailable(input, db as never)).rejects.toMatchObject({
    code: "budget_exhausted",
  });
});
test.each(["app", "programmatic"] as const)(
  "selects the %s surface without applying the other surface",
  async (surface) => {
    const namespace = meteringNamespace();
    state.budgets = [
      budget(
        { kind: "tag", namespace, tag: ownAllocationTag("serpapi", "c") },
        "units",
        0n,
        surface,
      ),
    ];
    await expect(
      assertProviderAllocationAvailable({ ...input, surface }, db as never),
    ).rejects.toMatchObject({ surface });
    await expect(
      assertProviderAllocationAvailable(
        { ...input, surface: surface === "app" ? "programmatic" : "app" },
        db as never,
      ),
    ).resolves.toMatchObject({ remaining: null });
  },
);
test.each(["group", "connection"] as const)(
  "unknown cost blocks via the %s paid_attempts gate",
  async (kind) => {
    const namespace = meteringNamespace();
    state.budgets = [
      budget(
        kind === "group" ? { kind, namespace, group: "p" } : { kind, namespace, connection: "c" },
        "paid_attempts",
        0n,
      ),
    ];
    await expect(assertProviderAllocationAvailable(input, db as never)).rejects.toMatchObject({
      code: kind === "group" ? "budget_exhausted" : "provider_allocation_exhausted",
    });
  },
);
test("credits and own-key budgets on one connection stay isolated", async () => {
  const namespace = meteringNamespace();
  state.budgets = [
    budget(
      { kind: "tag", namespace, tag: platformAllocationTag("serpapi", "c") },
      "customer_cents",
      0n,
    ),
  ];
  await expect(assertProviderAllocationAvailable(input, db as never)).resolves.toMatchObject({
    remaining: null,
  });
  state.source = "hosted";
  await expect(assertProviderAllocationAvailable(input, db as never)).rejects.toMatchObject({
    code: "provider_allocation_exhausted",
  });
});
test("outstanding Store reservations reduce available headroom", async () => {
  const namespace = meteringNamespace();
  state.budgets = [budget({ kind: "group", namespace, group: "p" }, "budget_cents", 10n)];
  state.used = 7;
  state.reserved = 2;
  await expect(assertProviderAllocationAvailable(input, db as never)).rejects.toMatchObject({
    budget: { spentCents: 7, reservedCents: 2 },
  });
});
test("a null limit remains unlimited while an explicit zero blocks", async () => {
  const namespace = meteringNamespace();
  state.budgets = [budget({ kind: "connection", namespace, connection: "c" }, "cents", null)];
  await expect(assertProviderAllocationAvailable(input, db as never)).resolves.toMatchObject({
    remaining: null,
  });
  state.budgets[0].limit = { unit: "cents", value: 0n, scale: 0 };
  await expect(assertProviderAllocationAvailable(input, db as never)).rejects.toMatchObject({
    code: "provider_allocation_exhausted",
  });
});
