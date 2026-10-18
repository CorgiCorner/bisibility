import { createPostgresStore } from "@/lib/metering/store";
import { Prisma as SQL } from "@/lib/metering/store/host-sql";
import { verifyTimestampHistory } from "@/lib/metering/store/timestamp-history";
import { createTransactionBoundStore } from "@/lib/metering/store/transactional";
import { canonicalUsageSql } from "@/lib/metering/usage-sql";
import { aggregateConnectionUsage } from "@/lib/provider-usage/connection-usage";
import { finalReceiptJoin, unknownAccounting } from "@/lib/provider-usage/reconcile-state";
import { runHistoricalCloseout } from "@/scripts/ops/closeout-historical-finances";
import { prismaPostgresExecutor } from "@usagekit/store-postgres";
import { expect } from "vitest";
import { planCloseout } from "./plan";
import type { closeoutPostgresFixture } from "./postgres.test-fixture";
import { applyCloseout } from "./service";
import { closeoutSnapshot } from "./snapshot";

type Fixture = Awaited<ReturnType<typeof closeoutPostgresFixture>>;

export async function proveLargeBatch(f: Fixture) {
  const manifest = await f.manifest(
    "bulk",
    Array.from({ length: 77 }, (_, index) => String(index).padStart(3, "0")),
  );
  const start = performance.now(),
    before = f.statements();
  const preview = await f.preview(manifest);
  const previewMs = performance.now() - start,
    previewStatements = f.statements() - before;
  expect(preview).toMatchObject({ count: 77, totalCostUsdUnits: "950565" });
  const applyStart = performance.now(),
    applyBefore = f.statements();
  expect(await f.apply(manifest, preview.planHash, 180000)).toMatchObject({
    closed: 77,
    replayed: false,
  });
  const applyMs = performance.now() - applyStart,
    applyStatements = f.statements() - applyBefore;
  const rows = (
    await f.client.query(
      "SELECT count(*) FROM metering_history_closeout WHERE operation_id LIKE 'legacy:bulk-%'",
    )
  ).rows;
  expect(rows[0].count).toBe("77");
  expect(previewStatements).toBeGreaterThan(0);
  expect(applyStatements).toBeGreaterThan(0);
  const receipt = {
    proof: "owned-77-originals",
    previewMs: Math.round(previewMs),
    previewStatements,
    applyMs: Math.round(applyMs),
    applyStatements,
    operatorTimeoutMs: 180000,
  };
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

export async function proveActorDiagnostic(f: Fixture) {
  const manifest = await f.manifest("schema");
  await f.client.query(`UPDATE users SET "isInstanceAdmin"=false WHERE "publicId"=$1`, [
    manifest.operator,
  ]);
  try {
    expect(await f.preview(manifest)).toMatchObject({
      count: 1,
      totalCostUsdUnits: "12345",
      applyReady: false,
      actorBlock: "active_verified_instance_administrator_required",
      planHash: null,
    });
    await expect(
      f.db.$transaction((tx) => applyCloseout(tx, manifest, "f".repeat(64))),
    ).rejects.toThrow("administrator is required");
  } finally {
    await f.client.query(`UPDATE users SET "isInstanceAdmin"=true WHERE "publicId"=$1`, [
      manifest.operator,
    ]);
  }
}

export async function proveReconnect(f: Fixture) {
  const manifest = await f.manifest("restart");
  const preview = await f.preview(manifest);
  await f.apply(manifest, preview.planHash);
  await f.db.$disconnect();
  await createPostgresStore({ prisma: f.db, clock: { now: () => new Date() } });
  await f.db.$transaction((tx) => verifyTimestampHistory(prismaPostgresExecutor(tx)));
  expect((await f.preview(manifest)).replayed).toBe(true);
}

export async function proveOperatorCLI(f: Fixture) {
  const manifest = await f.manifest("schema");
  const before = (
    await f.client.query(
      "SELECT operation_pk,state,version FROM metering_operation ORDER BY operation_pk",
    )
  ).rows;
  const result = await runHistoricalCloseout(f.url, manifest, undefined, 30000);
  expect(result).toMatchObject({
    count: 1,
    applyReady: true,
    execution: { mode: "read_only_preview", timeoutMs: 30000, maxWaitMs: 30000 },
  });
  expect(result.execution.statements).toBeGreaterThan(0);
  expect(
    (
      await f.client.query(
        "SELECT operation_pk,state,version FROM metering_operation ORDER BY operation_pk",
      )
    ).rows,
  ).toEqual(before);
}

export async function proveForgedMetadata(f: Fixture) {
  const manifest = await f.manifest("forged");
  await f.db.$transaction(async (tx) => {
    const snapshot = await closeoutSnapshot(tx, manifest);
    const plan = planCloseout(snapshot, manifest, new Date());
    const store = await createTransactionBoundStore({
      transaction: tx,
      clock: { now: () => new Date() },
    });
    expect((await store.correct(plan.corrections[0]!)).outcome).toBe("settled");
  });
  const unknown = await f.db.$queryRaw<{ count: bigint }[]>(
    SQL.sql`SELECT count(*) FROM metering_operation o ${finalReceiptJoin} WHERE o.namespace=${f.namespace} AND o.input->'scope'->>'group'='forged' AND ${unknownAccounting}`,
  );
  expect(unknown[0]!.count).toBe(1n);
  expect(
    (
      await f.client.query("SELECT count(*) FROM metering_history_closeout WHERE operation_id=$1", [
        manifest.operations[0]!.operationId,
      ])
    ).rows[0].count,
  ).toBe("0");
}

export async function proveFinancialOnlyUsage(f: Fixture) {
  const [row] = await f.db.$queryRaw<{ provider: string; usageQuantity: unknown }[]>(
    SQL.sql`SELECT provider,"usageQuantity" FROM (${canonicalUsageSql()}) u WHERE "projectId"='normal'`,
  );
  expect(row).toEqual({ provider: "historical-unknown", usageQuantity: null });
  const input = {
    projectId: "normal",
    connectionId: "retired-normal",
    credentialSource: "own" as const,
    now: new Date("2026-07-22T12:00:00Z"),
  };
  expect(await aggregateConnectionUsage(f.db, { ...input, unit: "units" })).toEqual({
    requestCount: 1,
    unconfirmedCount: 1,
    used: 0,
  });
  expect(await aggregateConnectionUsage(f.db, { ...input, unit: "cents" })).toEqual({
    requestCount: 1,
    unconfirmedCount: 0,
    used: 1.2345,
  });
}
