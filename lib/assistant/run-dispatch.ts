import "server-only";
import { notifyOps } from "@/lib/ops/notify";
import type { Lease, Operation } from "@usagekit/core";
import { dispatchBoundAssistantAttempt } from "./accounting-admission";
import type { AssistantAccountingBinding } from "./accounting-scope";
import { hostedAssistantProviderKey } from "./funding-extension";
import { isProjectModelCredential, readProjectModelCredential } from "./project-model-credential";
import { assistantTransaction } from "./transaction";

export const grantOf = (dispatched: { grant: { operation: Operation; lease: Lease } }) => ({
  operation: dispatched.grant.operation,
  lease: dispatched.grant.lease,
});

/** Our settlement write failed; the abandoned sweep will charge the reservation. */
export async function alertSweptAttempt(binding: AssistantAccountingBinding) {
  await notifyOps({
    dedupeKey: `assistant_attempt_unsettled:${binding.operationId}`,
    kind: "assistant_attempt_unsettled",
    severity: "warning",
    title: "Assistant settlement write failed; the abandoned sweep will charge the reservation",
    fields: { Operation: binding.operationId, Funding: binding.funding },
  }).catch(() => console.error("[assistant] unsettled attempt alert failed"));
}

/** An unknown attempt holds budgets until an operator reconciles it, so operations hear of it. */
export async function alertUnknownAttempt(binding: AssistantAccountingBinding) {
  await notifyOps({
    dedupeKey: `assistant_attempt_unknown:${binding.operationId}`,
    kind: "assistant_attempt_unknown",
    severity: "warning",
    title: "Assistant attempt has no provider receipt; run scripts/assistant/reconcile-unknown.ts",
    fields: { Operation: binding.operationId, Funding: binding.funding },
  }).catch(() => console.error("[assistant] unknown attempt alert failed"));
}

/**
 * Commits the send authority and picks the credential: the team's own key, or for Credits the
 * best platform key not in `exclude`. The platform key id is frozen on the attempt here.
 */
export async function dispatchAssistantTransport(
  binding: AssistantAccountingBinding,
  operation: Operation,
  exclude: readonly string[],
) {
  return assistantTransaction(async (tx) => {
    const grant = await dispatchBoundAssistantAttempt(
      tx,
      binding,
      operation,
      `assistant:${binding.runId}`,
    );
    const credential = binding.credentialId
      ? isProjectModelCredential(binding.credentialId)
        ? await readProjectModelCredential(
            tx,
            binding.projectId,
            binding.userId,
            binding.model.provider,
            binding.credentialId,
          )
        : await tx.assistantCredential.findUnique({
            where: { id: binding.credentialId },
            select: { encryptedSecret: true, versionHash: true },
          })
      : null;
    if (
      binding.funding === "byok" &&
      (!credential || credential.versionHash !== binding.credentialVersion)
    )
      throw new Error("Credential changed before dispatch");
    const secret = credential?.encryptedSecret ?? null;
    const hosted =
      binding.funding === "credits"
        ? await hostedAssistantProviderKey(binding.model.provider, { exclude, client: tx })
        : null;
    if (binding.funding === "credits" && !hosted) throw new Error("Hosted funding unavailable");
    // The key is frozen on the attempt in the same transaction that authorizes the send.
    if (hosted)
      await tx.assistantAttempt.update({
        where: { operationId: operation.operationId },
        data: { providerKeyId: hosted.keyId },
      });
    return { grant, secret, hosted };
  });
}
