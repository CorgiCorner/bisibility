import type { PrismaClient } from "@/lib/generated/prisma/client";
import { currentBudgets, saveBudget, status } from "@/lib/metering/store/budgets";
import { canonical, decode, key } from "@/lib/metering/store/codec";
import { createSql, Prisma as SQL } from "@/lib/metering/store/host-sql";
import { finalReceiptJoin, unknownAccounting } from "@/lib/provider-usage/reconcile-state";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import {
  proveActorDiagnostic,
  proveFinancialOnlyUsage,
  proveForgedMetadata,
  proveLargeBatch,
  proveOperatorCLI,
  proveReconnect,
} from "./acceptance.test-fixture";
import { closeoutPostgresFixture } from "./postgres.test-fixture";
import { applyCloseout, previewCloseout } from "./service";

const shared = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return shared.db;
  },
}));
let f: Awaited<ReturnType<typeof closeoutPostgresFixture>>;
beforeAll(async () => {
  f = await closeoutPostgresFixture();
  shared.db = f.db;
}, 30000);
afterAll(async () => {
  if (f) await f.close();
});
const ledger = async () =>
  (
    await f.client.query(
      "SELECT operation_pk,state,version FROM metering_operation ORDER BY operation_pk",
    )
  ).rows;

it("runs the full migration chain, preserves exact originals and uses normal money/paid-attempt counters", async () => {
  expect(f.migrationCount).toBeGreaterThan(120);
  const manifest = await f.manifest("normal");
  const original = (
    await f.client.query("SELECT payload FROM metering_legacy_usage_source ORDER BY source_id")
  ).rows;
  const receipt = (
    await f.client.query("SELECT * FROM metering_receipt WHERE operation_pk=$1 ORDER BY sequence", [
      key(f.namespace, manifest.operations[0]!.operationId),
    ])
  ).rows[0];
  const preview = await f.preview(manifest);
  expect(preview).toMatchObject({
    count: 1,
    totalCostUsdUnits: "12345",
    nativeUnits: null,
    providerIdentity: "unknown",
  });
  expect(await f.apply(manifest, preview.planHash)).toMatchObject({ closed: 1, replayed: false });
  expect(
    (await f.client.query("SELECT payload FROM metering_legacy_usage_source ORDER BY source_id"))
      .rows,
  ).toEqual(original);
  const receipts = (
    await f.client.query("SELECT * FROM metering_receipt WHERE operation_pk=$1 ORDER BY sequence", [
      receipt.operation_pk,
    ])
  ).rows;
  expect(receipts).toHaveLength(2);
  expect(receipts[0]).toEqual(receipt);
  expect(receipts[1].occurred_at).toEqual(receipt.occurred_at);
  expect(
    decode<{ measurements: { unit: string }[] }>(receipts[1].body).measurements.map((m) => m.unit),
  ).not.toContain("units");
  const counters = await f.db.$transaction(async (tx) => {
    const sql = createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 });
    const budgets = await currentBudgets(sql, f.namespace);
    const date = new Date("2026-07-22T12:00:00Z");
    return Promise.all(
      budgets
        .filter((b) => ["attempts", "project:normal:monthly"].includes(b.id))
        .map((b) => status(sql, b, date)),
    );
  });
  expect(counters.find((s) => s.budget.id === "attempts")?.used).toMatchObject({
    value: 1n,
    unit: "paid_attempts",
  });
  expect(counters.find((s) => s.budget.id === "project:normal:monthly")?.used).toMatchObject({
    value: 12345n,
    scale: 4,
  });
  expect(counters.every((s) => s.reserved?.value === 0n)).toBe(true);
  await proveFinancialOnlyUsage(f);
  const gates = (
    await f.client.query(
      "SELECT body FROM metering_budget WHERE budget_id LIKE 'unresolved:%' AND scope_key::jsonb->>'group'='normal' ORDER BY version DESC LIMIT 1",
    )
  ).rows;
  expect(decode<{ limit: unknown }>(gates[0].body).limit).toBeNull();
  const before = await ledger();
  const audit = (
    await f.client.query(
      "SELECT * FROM audit_logs WHERE action='instance_admin.metering_history_closed'",
    )
  ).rows;
  expect(audit).toHaveLength(1);
  expect(await f.apply(manifest, preview.planHash)).toMatchObject({ replayed: true });
  expect((await f.preview(manifest)).identityIncompleteHistory).toBe(1);
  expect(await ledger()).toEqual(before);
  expect(
    (
      await f.client.query(
        "SELECT * FROM audit_logs WHERE action='instance_admin.metering_history_closed'",
      )
    ).rows,
  ).toEqual(audit);
});

it("serializes two concurrent applies without duplicate receipts, counters or audit", async () => {
  const manifest = await f.manifest("race");
  const preview = await f.preview(manifest);
  const results = await Promise.all([
    f.apply(manifest, preview.planHash),
    f.apply(manifest, preview.planHash),
  ]);
  expect(results.map((r) => r.replayed).sort()).toEqual([false, true]);
  expect(
    (
      await f.client.query("SELECT count(*) FROM metering_receipt WHERE operation_pk=$1", [
        key(f.namespace, manifest.operations[0]!.operationId),
      ])
    ).rows[0].count,
  ).toBe("2");
});

it("rolls back correction, disposition, counters and gate if atomic audit fails", async () => {
  const manifest = await f.manifest("rollback");
  const preview = await f.preview(manifest);
  const before = await ledger();
  const counters = (
    await f.client.query("SELECT * FROM metering_budget_usage ORDER BY namespace,budget_id,epoch")
  ).rows;
  await f.client.query(
    "CREATE FUNCTION fixture_reject_closeout_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'owned audit failure'; END $$; CREATE TRIGGER fixture_reject_closeout_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fixture_reject_closeout_audit()",
  );
  try {
    await expect(f.apply(manifest, preview.planHash)).rejects.toThrow("owned audit failure");
  } finally {
    await f.client.query(
      "DROP TRIGGER fixture_reject_closeout_audit ON audit_logs; DROP FUNCTION fixture_reject_closeout_audit()",
    );
  }
  expect(await ledger()).toEqual(before);
  expect(
    (await f.client.query("SELECT * FROM metering_budget_usage ORDER BY namespace,budget_id,epoch"))
      .rows,
  ).toEqual(counters);
  expect(
    (
      await f.client.query("SELECT count(*) FROM metering_history_closeout WHERE operation_id=$1", [
        manifest.operations[0]!.operationId,
      ])
    ).rows[0].count,
  ).toBe("0");
});

it("refuses a stale approved budget digest and does not suppress a historical alert", async () => {
  const manifest = await f.manifest("stale");
  const preview = await f.preview(manifest);
  await f.db.$transaction(async (tx) => {
    const sql = createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 });
    const budget = (await currentBudgets(sql, f.namespace)).find(
      (b) => b.id === "project:stale:monthly",
    )!;
    await saveBudget(sql, { ...budget, version: 2, limit: null });
  });
  await expect(f.apply(manifest, preview.planHash)).rejects.toThrow("Preview changed");
  const alertManifest = await f.manifest("alerts");
  await f.db.$transaction(async (tx) => {
    const sql = createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 });
    const budget = (await currentBudgets(sql, f.namespace)).find(
      (b) => b.id === "project:alerts:monthly",
    )!;
    await saveBudget(sql, {
      ...budget,
      version: 2,
      alerts: [{ at: { unit: "budget_cents", value: 1n, scale: 4 } }],
    });
  });
  await expect(f.preview(alertManifest)).rejects.toThrow("retrospective budget alerts");
  expect((await f.client.query("SELECT count(*) FROM metering_alert")).rows[0].count).toBe("0");
});

it("keeps a shared gate blocked while any unselected original is unresolved", async () => {
  const manifest = await f.manifest("shared");
  const preview = await f.preview(manifest);
  await f.apply(manifest, preview.planHash);
  const unknown = await f.db.$queryRaw<{ count: bigint }[]>(
    SQL.sql`SELECT count(*) FROM metering_operation o ${finalReceiptJoin} WHERE o.namespace=${f.namespace} AND o.input->'scope'->>'group'='shared' AND ${unknownAccounting}`,
  );
  expect(unknown[0]!.count).toBe(1n);
  const gate = (
    await f.client.query(
      "SELECT body FROM metering_budget WHERE scope_key::jsonb->>'group'='shared' AND budget_id LIKE 'unresolved:%' ORDER BY version DESC LIMIT 1",
    )
  ).rows[0];
  expect(decode<{ limit: { value: bigint } }>(gate.body).limit.value).toBe(0n);
});

it("seals operation epochs, all receipts, measurements, journal and disposition; ordinary new native budgets remain legal", async () => {
  const manifest = await f.manifest("sealed");
  const preview = await f.preview(manifest);
  await f.apply(manifest, preview.planHash);
  const pk = key(f.namespace, manifest.operations[0]!.operationId);
  const queries = [
    "UPDATE metering_operation SET budget_epochs='[]' WHERE operation_pk=$1",
    "DELETE FROM metering_operation WHERE operation_pk=$1",
    "UPDATE metering_receipt SET body=body WHERE operation_pk=$1",
    "DELETE FROM metering_receipt WHERE operation_pk=$1",
    "UPDATE metering_measurement SET value=0 WHERE receipt_pk IN (SELECT receipt_pk FROM metering_receipt WHERE operation_pk=$1)",
    "UPDATE metering_history_import SET source_hash='forged' WHERE (namespace,operation_id) IN (SELECT namespace,operation_id FROM metering_operation WHERE operation_pk=$1)",
    "DELETE FROM metering_history_closeout WHERE operation_pk=$1",
  ];
  for (const query of queries)
    await expect(f.client.query(query, [pk])).rejects.toThrow(/sealed|immutable/);
  const before = (
    await f.client.query("SELECT budget_epochs FROM metering_operation WHERE operation_pk=$1", [pk])
  ).rows;
  await f.db.$transaction((tx) =>
    saveBudget(createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 }), {
      ...f.definition,
      id: "new-native-after-closeout",
      scope: { kind: "group", namespace: f.namespace, group: "sealed" },
      unit: "units",
    }),
  );
  expect(
    (
      await f.client.query("SELECT budget_epochs FROM metering_operation WHERE operation_pk=$1", [
        pk,
      ])
    ).rows,
  ).toEqual(before);
});

it("proves normal Store reconnect and independent timestamp history audit after financial correction", () =>
  proveReconnect(f));

it("requires read-only preview controls and the finalized original ledger", async () => {
  const manifest = await f.manifest("native");
  await expect(f.db.$transaction((tx) => previewCloseout(tx, manifest))).rejects.toThrow(
    "explicit read-only",
  );
  await expect(
    f.db.$transaction((tx) => applyCloseout(tx, manifest, "forged"), {
      isolationLevel: "RepeatableRead",
    }),
  ).rejects.toThrow("ReadCommitted");
  const before = await ledger();
  await f.db
    .$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE data_migrations SET "finishedAt"=NULL WHERE id='20261011021000_accounting_history'`;
      await expect(applyCloseout(tx, manifest, "forged")).rejects.toThrow("finalized first");
      throw new Error("owned rollback");
    })
    .catch((error) => {
      expect(error.message).toBe("owned rollback");
    });
  expect(await ledger()).toEqual(before);
  expect(canonical(before)).not.toContain("guessed-provider");
});

it("does not exempt a manually settled unknown provider with copied closeout metadata", () =>
  proveForgedMetadata(f));

it(
  "executes a real 77-original batch through the Store kernel with bounded operator timing and statement receipts",
  () => proveLargeBatch(f),
  180000,
);
it("reports diagnostic eligibility without an approval digest for a nonadmin and independently refuses apply", () =>
  proveActorDiagnostic(f));
it("warms the operator pool and runs the actual CLI preview without writes", () =>
  proveOperatorCLI(f));
