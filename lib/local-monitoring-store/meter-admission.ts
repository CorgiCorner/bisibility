import "server-only";
import { createHash } from "node:crypto";
import { ownAdmission } from "@/lib/provider-usage/admission-extension";
import type { OwnAttemptGrant } from "@/lib/provider-usage/admission-extension-types";
import { captureByokEvidence } from "@/lib/provider-usage/byok-evidence";
import type { ProviderRequest } from "@usagekit/providers";
import type { LocalCustodyBinding, LocalTransaction } from "./context";

export function localPaidAttemptId(binding: LocalCustodyBinding, operationKey: string) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        "byok",
        binding.connectionId,
        binding.attribution.context.correlationId,
        operationKey,
      ]),
    )
    .digest("hex");
}
/** Caller joins ownership/run-item writes in this exact transaction; no separate Meter. */
export async function admitLocalRequests(
  tx: LocalTransaction,
  inputs: readonly { binding: LocalCustodyBinding; key: string; request: ProviderRequest }[],
): Promise<OwnAttemptGrant[]> {
  if (!inputs.length || inputs.length > 100) throw new RangeError("Invalid local atomic taskset.");
  for (const input of inputs) {
    if (input.binding.attribution.context.feature !== "local_scan")
      throw new Error("Neutral local attribution is required.");
    const id = localPaidAttemptId(input.binding, input.key);
    await captureByokEvidence(tx, input.binding, id);
    const pending = await tx.meteringUsageEvidence.findFirst({
      where: {
        connectionId: input.binding.connectionId,
        projectId: input.binding.projectId,
        correlationId: input.binding.attribution.context.correlationId,
        measurementStatus: "unknown",
        discarded: false,
        id: { notIn: inputs.map((value) => localPaidAttemptId(value.binding, value.key)) },
      },
      select: { id: true },
    });
    if (pending) throw new Error("Retained accounting acceptance requires reconciliation.");
  }
  return ownAdmission.reserve(
    tx,
    inputs.map(({ binding, key, request }) => ({
      id: localPaidAttemptId(binding, key),
      credentialVersion: binding.credentialVersion,
      queued: true,
      providerRequest: request,
      maxCostCents: binding.maxCostCents,
      attribution: { tag: binding.attribution.tag, trigger: binding.attribution.context.trigger },
    })),
  );
}
