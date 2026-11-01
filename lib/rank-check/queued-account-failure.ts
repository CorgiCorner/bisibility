import type { ProviderConnection } from "@/lib/generated/prisma/client";
import { recordConnectionAccountFailure } from "@/lib/integrations/provider-recovery/account-failure";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { dataForSeoAccountAdapter } from "@/lib/providers/account-health/dataforseo";
import { DataForSeoError } from "@/lib/providers/serp/dataforseo-errors";

/** A provider payment refusal blocks future attempts independently of its uncertain cost. */
export async function recordQueuedAccountFailure(
  connection: Pick<ProviderConnection, "id" | "credentialSource" | "credentialsEncrypted">,
  projectId: string,
  error: unknown,
  minimumCapacity?: number | null,
) {
  if (connection.credentialSource !== "own" || !(error instanceof DataForSeoError)) return;
  const status = error.httpStatus ?? 200;
  await recordConnectionAccountFailure({
    connectionId: connection.id,
    projectId,
    provider: "dataforseo",
    httpStatus: status,
    fact: dataForSeoAccountAdapter.classify({
      status,
      body: { status_code: error.statusCode },
      scope: { kind: "capability", capability: "rank_check" },
    }),
    minimumCapacity,
    capacityUnit: "usd",
    credentialVersion: ownCredentialVersion(
      "dataforseo",
      connection.id,
      connection.credentialsEncrypted,
    ),
  });
}
