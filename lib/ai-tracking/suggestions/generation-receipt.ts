import "server-only";
import type { GenerationReceipt } from "@/lib/ai-tracking/stores/generation-contract";
import { prisma } from "@/lib/db/prisma";

export async function nativeGenerationReceipt(
  projectId: string,
  receipt: GenerationReceipt,
): Promise<GenerationReceipt> {
  if (!receipt.providerCostEntryId) return { ...receipt, state: "unknown", amountUsd: null };
  const ledger = await prisma.providerCostEntry.findFirst({
    where: {
      projectId,
      connectionId: receipt.connectionId,
      id: receipt.providerCostEntryId,
      provider: "dataforseo",
      feature: "ai_tracking",
      credentialSource: "own",
    },
    select: { measurementStatus: true, costCents: true, providerRequestId: true },
  });
  if (!ledger) throw new Error("Generation native ledger receipt is unavailable.");
  return {
    ...receipt,
    state: ledger.measurementStatus === "recorded" ? "confirmed" : "unknown",
    amountUsd:
      ledger.measurementStatus === "recorded" ? ledger.costCents.div(100).toString() : null,
    providerRequestId: ledger.providerRequestId,
  };
}
