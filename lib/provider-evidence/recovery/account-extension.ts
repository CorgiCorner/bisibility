import type { ProviderDispatchIdentity } from "@/lib/generated/prisma/client";
import type { RecoveryAccount } from "@/lib/provider-evidence/recovery/adapter";
export async function retainedRecoveryAccount(
  _identity: ProviderDispatchIdentity,
): Promise<RecoveryAccount | null> {
  return null;
}
