import "server-only";
import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import { persistByokEvidence } from "@/lib/provider-usage/byok-evidence-storage";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import type { ProviderUsageReceipt } from "@/lib/providers/usage";
import { acknowledgeOwnTransport } from "./transport-own-settlement";

export async function assertOwnTransportRetrieval(
  db: PrismaClient,
  connectionId: string,
  correlations: readonly string[],
) {
  if (!correlations.length) return false;
  const rows = await db.$queryRaw<{ version: string; provider: string }[]>(Prisma.sql`
    SELECT DISTINCT c.context->>'providerCredentialVersion' AS version,e.provider
    FROM metering_paid_attempt_context c JOIN metering_usage_evidence e ON e.id=c.operation_id AND e.namespace=c.namespace
    WHERE e."connectionId"=${connectionId} AND e."correlationId" IN (${Prisma.join([...correlations])})`);
  if (!rows.length) throw new Error("Original paid task binding is unavailable");
  const connection = await db.providerConnection.findUnique({ where: { id: connectionId } });
  if (
    connection?.credentialSource !== "own" ||
    rows.some(
      (r) =>
        r.provider !== connection.provider ||
        r.version !==
          ownCredentialVersion(connection.provider, connection.id, connection.credentialsEncrypted),
    )
  )
    throw new Error("Original own-key credential is unavailable; acceptance remains unknown");
  return true;
}
export async function recoverOwnTransport(
  tx: Prisma.TransactionClient,
  connectionId: string,
  correlationId: string,
  receipt: ProviderUsageReceipt,
) {
  const rows = await tx.meteringUsageEvidence.findMany({
    where: { connectionId, correlationId, discarded: false },
  });
  if (rows.length !== 1) throw new Error("Original paid task identity is unavailable or ambiguous");
  const row = rows[0];
  const previous = row.receipt as { costCents?: string | null } | null;
  if (receipt.costCents === 0)
    receipt = {
      ...receipt,
      costCents: previous?.costCents == null ? null : Number(previous.costCents),
    };
  const canonical = receipt.providerRequestId
    ? await tx.meteringUsageEvidence.findFirst({
        where: {
          connectionId,
          providerRequestId: receipt.providerRequestId,
          canonicalId: null,
          discarded: false,
          id: { not: row.id },
        },
      })
    : null;
  const canonicalId = canonical?.canonicalId ?? canonical?.id ?? null;
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM metering_usage_evidence WHERE id IN (${Prisma.join(canonicalId ? [canonicalId, row.id] : [row.id])}) ORDER BY id FOR UPDATE`,
  );
  if (canonicalId) {
    const original = await tx.meteringUsageEvidence.findUniqueOrThrow({
      where: { id: canonicalId },
    });
    const known = original.receipt as {
      costCents?: string | null;
      quantity?: string | null;
      cached?: boolean;
      failed?: boolean;
    } | null;
    await persistByokEvidence(
      tx,
      canonicalId,
      {
        ...receipt,
        costCents: known?.costCents == null ? receipt.costCents : Number(known.costCents),
        quantity: known?.quantity == null ? receipt.quantity : Number(known.quantity),
        cached: known?.cached ?? receipt.cached,
        failed: known?.failed ?? receipt.failed,
      },
      null,
    );
    await acknowledgeOwnTransport(tx, canonicalId);
  }
  await persistByokEvidence(tx, row.id, receipt, canonicalId);
  await acknowledgeOwnTransport(tx, row.id);
}
