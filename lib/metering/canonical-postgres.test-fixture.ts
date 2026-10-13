import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { Prisma } from "@/lib/generated/prisma/client";
import { historicalOperation } from "./history-mapping";
import { source } from "./history-test-data";
import type { HistoricalIdentity, LegacyUsageSource } from "./history-types";
import { meteringNamespace } from "./runtime";
import { importHistoricalEvidence } from "./store/host-history";

/** Owned fixtures retain imported evidence even when their project is deleted. */
export async function seedCanonicalUsage(
  client: PrismaClient,
  data: Partial<LegacyUsageSource>,
  identity: HistoricalIdentity = {},
) {
  const id = data.id ?? randomUUID();
  const cutoverAt = data.createdAt ?? new Date().toISOString();
  const operation = historicalOperation(
    source({ ...data, id }),
    meteringNamespace(),
    cutoverAt,
    identity,
  );
  await client.$transaction((tx) =>
    importHistoricalEvidence(tx, {
      migrationId: id,
      sourceId: id,
      sourceHash: id,
      operation,
      cutoverAt,
    }),
  );
  return { id, operationId: operation.operationId };
}
export async function clearCanonicalUsage(client: PrismaClient, ids: string[]) {
  if (!ids.length) return;
  const operations = Prisma.join(ids.map((id) => `legacy:${id}`));
  await client.$executeRaw(
    Prisma.sql`DELETE FROM metering_history_import WHERE migration_id IN (${Prisma.join(ids)})`,
  );
  await client.$executeRaw(
    Prisma.sql`DELETE FROM metering_event WHERE operation_pk IN (SELECT operation_pk FROM metering_operation WHERE namespace=${meteringNamespace()} AND operation_id IN (${operations}))`,
  );
  await client.$executeRaw(
    Prisma.sql`DELETE FROM metering_measurement WHERE receipt_pk IN (SELECT receipt_pk FROM metering_receipt WHERE operation_pk IN (SELECT operation_pk FROM metering_operation WHERE namespace=${meteringNamespace()} AND operation_id IN (${operations})))`,
  );
  await client.$executeRaw(
    Prisma.sql`DELETE FROM metering_receipt WHERE operation_pk IN (SELECT operation_pk FROM metering_operation WHERE namespace=${meteringNamespace()} AND operation_id IN (${operations}))`,
  );
  await client.$executeRaw(
    Prisma.sql`DELETE FROM metering_operation WHERE namespace=${meteringNamespace()} AND operation_id IN (${operations})`,
  );
}
/** Appends fixture corrections with the same Store receipt representation as imported history. */
export async function correctCanonicalUsage(
  client: PrismaClient,
  id: string,
  changes: Partial<LegacyUsageSource>,
) {
  const { appendReceipt } = await import("./store/records");
  const { createSql } = await import("./store/host-sql");
  await client.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<
      {
        legacy: LegacyUsageSource;
        input: { scope: { principal: string; providerCredentialVersion?: string } };
        count: bigint;
      }[]
    >(Prisma.sql`
      SELECT r.body->'metadata'->'legacy' AS legacy,o.input, (SELECT COUNT(*) FROM metering_receipt WHERE operation_pk=o.operation_pk) AS count
      FROM metering_operation o JOIN metering_receipt r ON r.operation_pk=o.operation_pk WHERE o.namespace=${meteringNamespace()} AND o.operation_id=${`legacy:${id}`} ORDER BY r.sequence DESC LIMIT 1`);
    if (!row) throw new Error("Missing canonical fixture");
    const operation = historicalOperation(
      { ...row.legacy, ...changes },
      meteringNamespace(),
      new Date().toISOString(),
      {
        principal: row.input.scope.principal,
        providerCredentialVersion: row.input.scope.providerCredentialVersion,
      },
    );
    await appendReceipt(
      createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 }),
      operation,
      operation.receipts[0] as NonNullable<(typeof operation.receipts)[0]>,
      Number(row.count),
    );
    if (changes.feature)
      await tx.$executeRaw(
        Prisma.sql`UPDATE metering_operation SET input=jsonb_set(input,'{operation}',${JSON.stringify(changes.feature)}::jsonb) WHERE namespace=${meteringNamespace()} AND operation_id=${`legacy:${id}`}`,
      );
    if (changes.credentialId)
      await tx.$executeRaw(
        Prisma.sql`UPDATE metering_operation SET input=jsonb_set(input,'{scope,accessCredential,id}',${JSON.stringify(changes.credentialId)}::jsonb) WHERE namespace=${meteringNamespace()} AND operation_id=${`legacy:${id}`}`,
      );
  });
}
