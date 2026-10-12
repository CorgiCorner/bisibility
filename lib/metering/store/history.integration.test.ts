import { preparePaidAttempt } from "@/lib/metering/current-paid-quote";
import { historicalOperation } from "@/lib/metering/history-mapping";
import { source } from "@/lib/metering/history-test-data";
import { input } from "@/lib/metering/paid-attempt-test-fixture";
import { projectSpendingBudget } from "@/lib/metering/spending-limits";
import { expect, test } from "vitest";
import { importHistoricalEvidence } from "./history";
import { Prisma, transactions } from "./sql";
import { fixture } from "./test-fixture";

const cutover = "2026-10-10T00:00:00.000Z";
test("inactive import restores original epochs once, detects full payload conflict and gates unknown history", async () => {
  const f = await fixture();
  f.clock.set(cutover);
  try {
    await f.store.putBudget(projectSpendingBudget("test", "project", "2", 1));
    const tx = transactions(f.client(), f.schema, f.counters);
    const op = historicalOperation(source(), "test", cutover);
    const payload = {
      migrationId: "history",
      sourceId: "legacy",
      sourceHash: "hash",
      operation: op,
      cutoverAt: cutover,
    };
    expect(await tx.write((sql) => importHistoricalEvidence(sql, payload))).toMatchObject({
      outcome: "imported",
      replayed: false,
    });
    expect(await tx.write((sql) => importHistoricalEvidence(sql, payload))).toMatchObject({
      outcome: "imported",
      replayed: true,
    });
    expect(
      await tx.write((sql) =>
        importHistoricalEvidence(sql, { ...payload, operation: { ...op, provider: "other" } }),
      ),
    ).toEqual({ outcome: "conflict", sourceId: "legacy" });
    const status = await f.store.applicableBudgets({
      scope: op.scope,
      surface: "app",
      units: ["budget_cents"],
    });
    expect(status[0]?.used).toMatchObject({ value: 12345n, scale: 4 });
    const pending = historicalOperation(
      source({ id: "unknown", measurementStatus: "unknown" }),
      "test",
      cutover,
    );
    await tx.write((sql) =>
      importHistoricalEvidence(sql, { ...payload, sourceId: "unknown", operation: pending }),
    );
    const next = input("new");
    next.reservation.estimate = [{ unit: "cents", value: 0n, scale: 4 }];
    expect(await f.store.reserve(preparePaidAttempt(next))).toMatchObject({
      outcome: "exceeded",
      exceeded: { budget: { unit: "paid_attempts" } },
    });
    expect(
      await tx.read((sql) => sql.query(Prisma.sql`SELECT lease_id FROM metering_operation`)),
    ).toEqual([{ lease_id: null }, { lease_id: null }]);
  } finally {
    await f.close();
  }
});
test("a failed journal write rolls operation, receipts, counters and gate back", async () => {
  const f = await fixture();
  f.clock.set(cutover);
  try {
    const tx = transactions(f.client(), f.schema, f.counters);
    await tx.write(async (sql) => {
      await sql.execute(
        Prisma.sql`CREATE FUNCTION deny_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'history crash'; END $$`,
      );
      await sql.execute(
        Prisma.sql`CREATE TRIGGER deny_history BEFORE INSERT ON metering_history_import FOR EACH ROW EXECUTE FUNCTION deny_history()`,
      );
    });
    await expect(
      tx.write((sql) =>
        importHistoricalEvidence(sql, {
          migrationId: "history",
          sourceId: "legacy",
          sourceHash: "hash",
          cutoverAt: cutover,
          operation: historicalOperation(source(), "test", cutover),
        }),
      ),
    ).rejects.toThrow("history crash");
    expect(
      await f.store.getOperation({
        namespace: "test",
        principal: "historical-unattributed:project",
        operationId: "legacy:legacy",
      }),
    ).toBeNull();
  } finally {
    await f.close();
  }
});
test("existing canonical operations retain rate evidence without counting the original spend twice", async () => {
  const f = await fixture();
  f.clock.set(cutover);
  try {
    const tx = transactions(f.client(), f.schema, f.counters);
    await f.store.putBudget(projectSpendingBudget("test", "project", "2", 1));
    const base = historicalOperation(source(), "test", cutover);
    await tx.write((sql) =>
      importHistoricalEvidence(sql, {
        migrationId: "prior",
        sourceId: "old",
        sourceHash: "old",
        operation: base,
        cutoverAt: cutover,
      }),
    );
    const retained = await f.store.getOperation({
      namespace: "test",
      principal: base.scope.principal,
      operationId: base.operationId,
    });
    if (!retained) throw new Error("missing fixture operation");
    const previous = retained.receipts.at(-1);
    if (!previous) throw new Error("missing fixture receipt");
    const op = {
      ...retained,
      version: retained.version + 1,
      receipts: [...retained.receipts, { ...previous, id: "provenance", supersedes: previous.id }],
    };
    expect(
      await tx.write((sql) =>
        importHistoricalEvidence(sql, {
          migrationId: "history",
          sourceId: "legacy",
          sourceHash: "source",
          operation: op,
          cutoverAt: cutover,
        }),
      ),
    ).toMatchObject({ outcome: "imported", replayed: false });
    expect(
      (
        await f.store.applicableBudgets({
          scope: op.scope,
          surface: "app",
          units: ["budget_cents"],
        })
      )[0]?.used?.value,
    ).toBe(12345n);
  } finally {
    await f.close();
  }
});
test("canonical history with connection epochs also acquires the migrated project cap epoch", async () => {
  const f = await fixture();
  f.clock.set(cutover);
  try {
    const tx = transactions(f.client(), f.schema, f.counters);
    await f.store.putBudget({
      ...projectSpendingBudget("test", "project", "2", 1),
      id: "old-connection",
      unit: "cents",
      scope: { kind: "connection", namespace: "test", connection: "connection" },
      limit: { unit: "cents", value: 20n, scale: 0 },
    });
    const op = historicalOperation(source(), "test", cutover);
    await tx.write((sql) =>
      importHistoricalEvidence(sql, {
        migrationId: "old",
        sourceId: "old",
        sourceHash: "old",
        operation: op,
        cutoverAt: cutover,
      }),
    );
    const retained = await f.store.getOperation({
      namespace: "test",
      principal: op.scope.principal,
      operationId: op.operationId,
    });
    if (!retained) throw new Error("Missing operation");
    await f.store.putBudget(projectSpendingBudget("test", "project", "2", 1));
    await tx.write((sql) =>
      importHistoricalEvidence(sql, {
        migrationId: "history",
        sourceId: "legacy",
        sourceHash: "source",
        operation: retained,
        cutoverAt: cutover,
      }),
    );
    expect(
      (
        await f.store.applicableBudgets({
          scope: op.scope,
          surface: "app",
          units: ["budget_cents"],
        })
      ).find((s) => s.budget.id === "project:project:monthly")?.used?.value,
    ).toBe(12345n);
  } finally {
    await f.close();
  }
});
test("the historical adapter accepts the caller's Prisma transaction", async () => {
  const f = await fixture();
  try {
    const result = await f.client().$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SET LOCAL search_path TO ${Prisma.raw(f.schema)}`);
      return importHistoricalEvidence(tx, {
        migrationId: "history",
        sourceId: "legacy",
        sourceHash: "source",
        operation: historicalOperation(source(), "test", cutover),
        cutoverAt: cutover,
      });
    });
    expect(result).toMatchObject({ outcome: "imported", replayed: false });
  } finally {
    await f.close();
  }
});
