import { createHash } from "node:crypto";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";

type ConnectionConfiguration = Readonly<{
  id: string;
  projectId: string;
  provider: string;
  kind: string;
  status: string;
  enabled: boolean;
  credentialSource: string;
  credentialsEncrypted: string | null;
  providerUiRevision: bigint | string;
}>;

/** Semantic revision includes rate/configuration ABA changes, never usage/sync timestamps. */
export function providerConnectionRevision(connection: ConnectionConfiguration) {
  const revision = String(connection.providerUiRevision);
  if (!/^(?:0|[1-9]\d*)$/u.test(revision))
    throw new Error("Provider configuration revision is unavailable.");
  const digest = createHash("sha256")
    .update(
      JSON.stringify([
        "provider-config-v1",
        connection.id,
        connection.projectId,
        connection.provider,
        connection.kind,
        connection.status,
        connection.enabled,
        connection.credentialSource,
        revision,
        ownCredentialVersion(connection.provider, connection.id, connection.credentialsEncrypted),
      ]),
    )
    .digest("hex");
  return digest;
}
