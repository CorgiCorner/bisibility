import { providerRecoveryScope } from "./scope";
import { validateRecoveryGet } from "./validate-get";
import "server-only";
import type { ProviderDispatchIdentity } from "@/lib/generated/prisma/client";
import type { HistoryTask, ProviderRecoveryAdapter } from "./adapter";
import { recoveryAdapters } from "./registry";
import { retainedSubmission } from "./submission";
import { recoverySwitches } from "./switches";

export type LookupDependencies = {
  resolveAccount?: ProviderRecoveryAdapter["resolveAccount"];
  transport?: ProviderRecoveryAdapter["createTransport"];
  adapters?: Pick<typeof recoveryAdapters, "get">;
};
/** Evidence read only. No proof, result, authority, fence or financial persistence. */
export async function lookupRecoveryEvidence(
  identity: ProviderDispatchIdentity | null,
  nativeId: string | null,
  now = new Date(),
  dependencies: LookupDependencies = {},
) {
  if (!recoverySwitches().lookup) return { kind: "inactive" as const, reason: "lookup_disabled" };
  const current = providerRecoveryScope();
  if (
    identity &&
    (identity.namespace !== current.namespace || identity.instanceId !== current.instanceId)
  )
    return { kind: "operator_review" as const, reason: "foreign_recovery_scope" };
  const retained = retainedSubmission(identity, now);
  if (retained.kind !== "retained" || !identity) return retained;
  const scope = {
    provider: identity.provider,
    feature: identity.feature,
    submittedEndpointPath: identity.endpointPath,
  };
  const adapter = (dependencies.adapters ?? recoveryAdapters).get(identity.provider);
  const capability = adapter?.capability(scope);
  if (!adapter || capability?.kind !== "supported")
    return { kind: "operator_review" as const, reason: "adapter_not_opted_in" };
  const account = await (dependencies.resolveAccount ?? adapter.resolveAccount)(identity).catch(
    () => null,
  );
  if (
    !account ||
    account.credentialVersion !== identity.providerCredentialVersion ||
    (identity.payerKind === "byok" && account.accountId !== identity.payerAccountRef)
  )
    return { kind: "operator_review" as const, reason: "original_credential_unavailable" };
  const transport = (dependencies.transport ?? adapter.createTransport)(account);
  if (nativeId && capability.capability.taskGetPath)
    return {
      ...validateRecoveryGet(
        identity,
        retained.submission,
        await adapter.getTask(
          transport,
          { ...scope, id: nativeId, submittedAt: identity.createdAt.toISOString() },
          now,
        ),
        adapter,
      ),
      proofSource: {
        accountId: account.accountId,
        credentialVersion: account.credentialVersion,
        knownId: true,
        listedCostCents: null,
      },
    };
  if (!identity.nativeTag)
    return { kind: "operator_review" as const, reason: "missing_native_tag" };
  const candidates: HistoryTask[] = [];
  for await (const page of adapter.listHistory(
    transport,
    {
      ...scope,
      from: new Date(identity.createdAt.getTime() - 1000).toISOString(),
      to: now.toISOString(),
    },
    now,
  )) {
    if (page.kind !== "page" && page.kind !== "empty_page") return page;
    candidates.push(...page.tasks);
  }
  const match = adapter.matchTask(identity.nativeTag, retained.submission, candidates);
  if (match.kind !== "match") return { kind: "operator_review" as const, reason: match.kind };
  if (nativeId && match.task.id !== nativeId)
    return { kind: "operator_review" as const, reason: "native_task_id_conflict" };
  if (!capability.capability.taskGetPath)
    return {
      kind: "metadata_evidence" as const,
      task: match.task,
      acceptance: "accepted" as const,
      resultAvailable: false,
    };
  return {
    ...validateRecoveryGet(
      identity,
      retained.submission,
      await adapter.getTask(
        transport,
        { ...scope, id: match.task.id, submittedAt: identity.createdAt.toISOString() },
        now,
      ),
      adapter,
    ),
    proofSource: {
      accountId: account.accountId,
      credentialVersion: account.credentialVersion,
      knownId: false,
      listedCostCents: match.task.costCents,
    },
  };
}
