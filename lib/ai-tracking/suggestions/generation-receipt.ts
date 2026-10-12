import { meterOperationReference, receiptOperationId } from "@/lib/metering/operation-reference";
import "server-only";
import type { GenerationReceipt } from "@/lib/ai-tracking/stores/generation-contract";
import { prisma } from "@/lib/db/prisma";
import { canonicalReceipt } from "@/lib/metering/usage-read";

export async function nativeGenerationReceipt(
  projectId: string,
  receipt: GenerationReceipt,
): Promise<GenerationReceipt> {
  const operationId = receiptOperationId(receipt);
  if (!operationId) return { ...receipt, state: "unknown", amountUsd: null };
  const ledger = await canonicalReceipt(prisma, projectId, operationId, receipt.connectionId);
  if (
    !ledger ||
    ledger.provider !== "dataforseo" ||
    ledger.feature !== "ai_tracking" ||
    ledger.credentialSource !== "own"
  )
    throw new Error("Generation canonical receipt is unavailable.");
  return {
    ...receipt,
    providerCostEntryId: null,
    operationRef: meterOperationReference(ledger.id, ledger.namespace),
    state: ledger.measurementStatus === "recorded" ? "confirmed" : "unknown",
    amountUsd:
      ledger.measurementStatus === "recorded"
        ? (ledger.costCents?.div(100).toString() ?? null)
        : null,
    providerRequestId: ledger.providerRequestId,
  };
}
