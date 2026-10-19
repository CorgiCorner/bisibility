import type { Prisma } from "@/lib/generated/prisma/client";
import { historicalOperation } from "@/lib/metering/history-mapping";
import { source } from "@/lib/metering/history-test-data";
import type { LegacyUsageSource } from "@/lib/metering/history-types";
import { importHistoricalEvidence } from "@/lib/metering/store/host-history";
import { Prisma as SQL, transactions } from "@/lib/metering/store/host-sql";
import { fixture } from "@/lib/metering/store/test-fixture";
import type { Budget } from "@usagekit/core";
import { historicalResolutionSchema } from "./manifest";

export async function historyFixture(
  rows: Partial<LegacyUsageSource>[] = [{}],
  budgets: Budget[] = [],
) {
  const f = await fixture();
  // The shared accounting fixture only creates an ID placeholder. Match the production
  // task evidence columns from core.prisma, including exact decimal storage.
  await f.client().$transaction(async (tx) => {
    await tx.$executeRaw(SQL.sql`SET LOCAL search_path TO ${SQL.raw(f.schema)}`);
    await tx.$executeRaw`ALTER TABLE queued_rank_check_tasks ADD COLUMN "providerTaskId" text, ADD COLUMN "costCents" decimal(10,4), ADD COLUMN "batchId" text, ADD COLUMN "providerTag" text`;
    await tx.$executeRaw`CREATE TABLE queued_rank_check_batches (id text PRIMARY KEY, "connectionId" text, "projectId" text, provider text)`;
  });
  f.budgets.push(...budgets);
  await f.syncBudgets();
  const ops = rows.map((row, n) =>
    historicalOperation(
      source({
        id: `legacy-${n}`,
        usageQuantity: null,
        correlationId: null,
        ...row,
      }),
      "test",
      "2026-10-11T00:00:00.000Z",
    ),
  );
  for (const op of ops)
    await transactions(f.client(), f.schema, f.counters).write((sql) =>
      importHistoricalEvidence(sql, {
        migrationId: "20261011021000_accounting_history",
        sourceId: op.operationId.slice(7),
        sourceHash: `retained-${op.operationId}`,
        cutoverAt: op.updatedAt,
        operation: op,
      }),
    );
  const run = <T>(body: (tx: Prisma.TransactionClient) => Promise<T>, readOnly = false) =>
    f.client().$transaction(
      async (tx) => {
        if (readOnly) await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        // Same session as the production writer (createSql): the metering_utc_writers trigger
        // rejects any other TimeZone name, including the server default Etc/UTC.
        await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
        await tx.$executeRaw(SQL.sql`SET LOCAL search_path TO ${SQL.raw(f.schema)}`);
        return body(tx);
      },
      { timeout: 30000, isolationLevel: readOnly ? "RepeatableRead" : "ReadCommitted" },
    );
  const manifest = historicalResolutionSchema.parse({
    namespace: "test",
    connection: "connection",
    operator: "local-operator",
    reason: "Verified retained provider invoice",
    evidenceRef: "invoice:example-evidence",
    recordedAt: "2026-10-18T00:00:00.000Z",
    operations: ops.map((op) => ({
      operationId: op.operationId,
      expectedVersion: op.version,
      receiptId: op.receipts[0]!.id,
      omitUnknownUnits: true,
    })),
  });
  return { ...f, run, manifest, ops };
}
export const centsBudget = (): Budget => ({
  id: "project-cost",
  version: 1,
  scope: { kind: "group", namespace: "test", group: "project" },
  unit: "budget_cents",
  surface: "any",
  onExceed: "block",
  limit: { unit: "budget_cents", value: 500000n, scale: 4 },
  window: { kind: "calendar_month", timezone: "UTC" },
});
