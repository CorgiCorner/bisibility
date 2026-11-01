import "server-only";
import { readDemoConfig } from "@/lib/demo/config";
import { decryptProviderCredentials } from "@/lib/providers/crypto";
import { type CheckInput, claimAccountCheck } from "./check-claim";
import { finishAccountCheck } from "./check-finish";
import { runAccountProbe } from "./probe";
import { readConnectionRecovery } from "./read";

export async function checkRecoveryAccount(input: CheckInput) {
  if (readDemoConfig().kind !== "disabled")
    throw new Error("Provider account verification is unavailable in demo.");
  const claim = await claimAccountCheck(input);
  if (claim.status !== "claimed") {
    return {
      view: await readConnectionRecovery(input.projectId, claim.original.id),
      accountState: claim.status,
    };
  }
  const result = await (async () => {
    try {
      return await runAccountProbe({
        adapter: claim.adapter,
        credentials: decryptProviderCredentials(claim.original.credentialsEncrypted),
        projectId: input.projectId,
        provider: claim.original.provider,
      });
    } catch {
      return { fact: { kind: "not_verified" as const, scope: { kind: "account" as const } } };
    }
  })();
  const accountState = await finishAccountCheck(input, claim, result);
  return { view: await readConnectionRecovery(input.projectId, claim.original.id), accountState };
}
