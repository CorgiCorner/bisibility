import { ProviderLookupSignal } from "./lookup-failure";

export function assertOwnCredentialSnapshot(
  input: { requiredCredentialSource?: "own"; connection: { credentialsEncrypted: string | null } },
  current: { credentialSource: string; credentialsEncrypted: string | null },
) {
  if (input.requiredCredentialSource !== "own") return;
  if (current.credentialSource !== "own")
    throw new ProviderLookupSignal({ ok: false, reason: "own_credentials_required" });
  if (current.credentialsEncrypted !== input.connection.credentialsEncrypted)
    throw new ProviderLookupSignal({ ok: false, reason: "credentials_changed" });
}
