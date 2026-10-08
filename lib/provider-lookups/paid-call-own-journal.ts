import type { PrismaClient } from "@/lib/generated/prisma/client";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { createProviderRequestJournal } from "@/lib/provider-usage/request-journal";
import type { ProviderRequestAttribution } from "@/lib/provider-usage/tag";
import { providerAllocationMetadata } from "@/lib/providers/allocation-metadata";

export function createOwnPaidCallJournal(
  db: PrismaClient,
  input: {
    attribution: ProviderRequestAttribution;
    connection: { id: string; provider: string; credentialsEncrypted: string | null };
    projectId: string;
    estimatedCostCents: number;
  },
) {
  const allocation = providerAllocationMetadata(input.connection.provider);
  if (allocation?.kind !== "billable") return null;
  return createProviderRequestJournal(db, {
    attribution: input.attribution,
    connectionId: input.connection.id,
    projectId: input.projectId,
    provider: input.connection.provider,
    unit: allocation.allocationUnit,
    credentialVersion: ownCredentialVersion(
      input.connection.provider,
      input.connection.id,
      input.connection.credentialsEncrypted,
    ),
    estimate: { cents: input.estimatedCostCents.toFixed(4), units: "1" },
  });
}
