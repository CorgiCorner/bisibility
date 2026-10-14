import "server-only";
import { ownAdmission } from "@/lib/provider-usage/admission-extension";
import { recordByokEvidence } from "@/lib/provider-usage/byok-evidence";
import type { ProviderUsageReceipt } from "@/lib/providers/usage";
import type { LocalTransaction } from "./context";

/** First zero receipt is native proof, not retrieval's zero-cost placeholder. */
export async function settleLocalMeter(
  tx: LocalTransaction,
  connectionId: string,
  correlationId: string,
  id: string,
  receipt: ProviderUsageReceipt,
) {
  if (receipt.cached !== false) throw new Error("Paid local submit cannot be a cache receipt.");
  if (receipt.providerRequestId)
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${JSON.stringify(["own-native", connectionId, receipt.providerRequestId])},0))`;
  const retained = await tx.meteringUsageEvidence.findUniqueOrThrow({ where: { id } });
  if (retained.connectionId !== connectionId || retained.correlationId !== correlationId)
    throw new Error("Original native receipt binding changed.");
  const native = receipt.providerRequestId
    ? await tx.meteringUsageEvidence.findFirst({
        where: {
          connectionId,
          providerRequestId: receipt.providerRequestId,
          discarded: false,
          id: { not: id },
        },
        select: { id: true },
      })
    : null;
  if (native || retained.canonicalId !== null) {
    // Canonical recovery owns duplicate native IDs, trusted corrections and composed invoice history.
    await ownAdmission.recover(tx, connectionId, correlationId, receipt);
  } else {
    // This is verified original submit proof, including real zero. Recovery's retrieval
    // zero placeholder must not suppress a newly proved zero in the native stream.
    await recordByokEvidence(tx, id, receipt, null);
  }
}
