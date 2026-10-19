import { reconciliationHealth } from "@/lib/provider-usage/reconcile-state";
import { expect, test } from "vitest";
import { currentBudgets, usage } from "../store/budgets";
import { canonical, effective } from "../store/codec";
import { createSql } from "../store/host-sql";
import { hydrate, operationRow } from "../store/records";
import { applyHistoricalResolution, previewHistoricalResolution } from "./service";
import { centsBudget, historyFixture } from "./test-fixture";

test("real PostgreSQL: retained cents settle without transport context, recounting, or new usage time", async () => {
  const f = await historyFixture([{}, { measurementStatus: "unknown" }], [centsBudget()]);
  try {
    f.manifest.operations[1]!.costCents = "2.5000";
    const before = await f.run(async (tx) => {
      const sql = createSql(tx, f.counters);
      return hydrate(sql, (await operationRow(sql, "test", f.ops[0]!.operationId))!);
    }, true);
    const plan = await f.run((tx) => previewHistoricalResolution(tx, f.manifest), true);
    const outcomes = await Promise.all(
      [0, 1].map(() => f.run((tx) => applyHistoricalResolution(tx, f.manifest, plan.planHash))),
    );
    expect(outcomes.map((r) => r.replayed).sort()).toEqual([false, true]);
    await f.run(async (tx) => {
      const sql = createSql(tx, f.counters);
      const after = await hydrate(sql, (await operationRow(sql, "test", before.operationId))!);
      expect(after.state).toBe("settled");
      expect(after.createdAt).toBe(before.createdAt);
      expect(after.budgetEpochs).toEqual(before.budgetEpochs);
      expect(after.receipts).toHaveLength(2);
      expect(after.receipts[0]).toEqual(before.receipts[0]);
      expect(effective(after)?.occurredAt).toBe(before.receipts[0]!.occurredAt);
      expect(effective(after)?.recordedAt).toBe(f.manifest.recordedAt);
      expect(effective(after)?.cost).toEqual(before.receipts[0]!.cost);
      expect(effective(after)?.measurements.find((m) => m.unit === "units")).toBeUndefined();
      const budget = (await currentBudgets(sql, "test")).find((b) => b.id === "project-cost")!;
      const amounts = await usage(sql, budget, after.budgetEpochs[0]!.epoch);
      expect(amounts.used).toEqual({ unit: "budget_cents", value: 37345n, scale: 4 });
      expect((await reconciliationHealth(tx, "test", new Date())).unconfirmed).toBe(0);
      const gates = (await currentBudgets(sql, "test")).filter((b) =>
        b.id.startsWith("unresolved:"),
      );
      expect(gates).toHaveLength(2);
      expect(gates.every((b) => b.limit === null)).toBe(true);
      const [context] = await tx.$queryRaw<
        { n: bigint }[]
      >`SELECT count(*) AS n FROM metering_paid_attempt_context`;
      expect(context?.n).toBe(0n);
    }, true);
  } finally {
    await f.close();
  }
});

test("partial resolution keeps shared gates; changed preview rolls back the complete batch", async () => {
  const f = await historyFixture([
    { measurementStatus: "unknown" },
    { measurementStatus: "unknown" },
  ]);
  try {
    f.manifest.operations.forEach((i) => {
      i.costCents = "1";
    });
    const all = await f.run((tx) => previewHistoricalResolution(tx, f.manifest), true);
    const changed = { ...f.manifest, reason: "Changed evidence must require another preview" };
    await expect(
      f.run((tx) => applyHistoricalResolution(tx, changed, all.planHash)),
    ).rejects.toThrow("Preview changed");
    expect(
      (await f.run((tx) => reconciliationHealth(tx, "test", new Date()), true)).unconfirmed,
    ).toBe(2);
    const half = { ...f.manifest, operations: f.manifest.operations.slice(0, 1) };
    const plan = await f.run((tx) => previewHistoricalResolution(tx, half), true);
    await f.run((tx) => applyHistoricalResolution(tx, half, plan.planHash));
    const gates = await f.run((tx) => currentBudgets(createSql(tx, f.counters), "test"), true);
    expect(
      gates.filter((b) => b.id.startsWith("unresolved:")).every((b) => b.limit?.value === 0n),
    ).toBe(true);
    const after = await f.run((tx) => previewHistoricalResolution(tx, half), true);
    expect(after).toEqual({ ...after, planHash: plan.planHash, replayed: true, corrections: [] });
    expect(canonical(after)).not.toContain("correction received");
  } finally {
    await f.close();
  }
});
