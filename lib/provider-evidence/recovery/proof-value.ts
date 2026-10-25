import type { ProviderDispatchIdentity } from "@/lib/generated/prisma/client";
import { canonical, hash } from "@/lib/metering/store/codec";
import type { lookupRecoveryEvidence } from "./lookup";

export type RecoveryLookup = Awaited<ReturnType<typeof lookupRecoveryEvidence>>;
export function verifiedProofValue(identity: ProviderDispatchIdentity, outcome: RecoveryLookup) {
  if (
    outcome.kind !== "evidence" ||
    outcome.topStatus.code !== 20000 ||
    !outcome.proofSource ||
    outcome.tasks.length !== 1
  )
    return { kind: "unknown" as const, reason: "native_proof_unavailable" };
  const task = outcome.tasks[0];
  const source = outcome.proofSource;
  if (!task.id || source.credentialVersion !== identity.providerCredentialVersion)
    return { kind: "conflict" as const, reason: "native_identity_conflict" };
  if (task.costCents === null) return { kind: "unknown" as const, reason: "native_cost_unknown" };
  if (!source.knownId && source.listedCostCents === null)
    return { kind: "unknown" as const, reason: "id_list_cost_unknown" };
  if (source.listedCostCents !== null && source.listedCostCents !== task.costCents)
    return { kind: "conflict" as const, reason: "id_list_cost_conflict" };
  if (
    !["success", "terminal_empty_success", "partial", "provider_error"].includes(
      task.classification,
    )
  )
    return { kind: "unknown" as const, reason: "native_task_not_terminal" };
  const body = {
    provider: identity.provider,
    accountId: source.accountId,
    nativeId: task.id,
    costCents: task.costCents.toFixed(4),
    quantity: "1.000000",
    failed: task.classification === "provider_error",
    cached: false,
  };
  const id = hash(
    canonical([
      identity.namespace,
      identity.instanceId,
      body.provider,
      body.accountId,
      body.nativeId,
    ]),
  );
  return { kind: "verified" as const, id, evidenceHash: hash(canonical(body)), body };
}
export type VerifiedRecoveryProof = Extract<
  ReturnType<typeof verifiedProofValue>,
  { kind: "verified" }
>;
