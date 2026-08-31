import { decryptProviderCredentials, isEncryptedSecret } from "@/lib/providers/crypto";
import type { ProviderCredentials } from "@/lib/providers/types";

type ProviderIdentity = Pick<ProviderCredentials, "accountEmail" | "endpoint" | "login">;

export type ProviderIdentityResult =
  | { state: "absent" }
  | ({ state: "readable" } & ProviderIdentity)
  | { reason: "decryption_failed"; state: "unreadable" };

export function readableProviderIdentity(
  encrypted: string | null | undefined,
): ProviderIdentityResult {
  if (!encrypted || !isEncryptedSecret(encrypted)) {
    return { state: "absent" };
  }

  try {
    const { accountEmail, endpoint, login } = decryptProviderCredentials(encrypted);
    return {
      ...(accountEmail ? { accountEmail } : {}),
      ...(endpoint ? { endpoint } : {}),
      ...(login ? { login } : {}),
      state: "readable",
    };
  } catch {
    return { reason: "decryption_failed", state: "unreadable" };
  }
}
