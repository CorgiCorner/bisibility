import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ProviderLookupSignal } from "@/lib/provider-lookups/paid-call";
import { getSerpProvider } from "@/lib/providers/registry";
import { providerChainWhere } from "@/lib/rank-check/provider-chain-order";
import { AI_RESEARCH_PROVIDER_ID } from "./catalog-types";

export async function requireAiSource(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      ownerId: true,
      lookupCacheTtlSeconds: true,
      providerConnections: {
        select: {
          id: true,
          publicId: true,
          updatedAt: true,
          provider: true,
          credentialsEncrypted: true,
          credentialSource: true,
        },
        where: { ...providerChainWhere("serp"), provider: AI_RESEARCH_PROVIDER_ID },
        take: 1,
      },
    },
  });
  const connection = project?.providerConnections[0];
  if (!project || !connection) throw new ProviderLookupSignal({ ok: false, reason: "no_source" });
  return { project, connection, provider: getSerpProvider(connection.provider) };
}
