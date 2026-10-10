import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ProviderLookupSignal } from "@/lib/provider-lookups/paid-call";
import { getSerpProvider } from "@/lib/providers/registry";
import { providerChainWhere } from "@/lib/rank-check/provider-chain-order";

export async function requireAiSource(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      budgetCapCents: true,
      providerConnections: {
        select: { id: true, provider: true, credentialsEncrypted: true, credentialSource: true },
        where: { ...providerChainWhere("serp"), provider: "dataforseo" },
        take: 1,
      },
    },
  });
  const connection = project?.providerConnections[0];
  if (!project || !connection) throw new ProviderLookupSignal({ ok: false, reason: "no_source" });
  return { project, connection, provider: getSerpProvider(connection.provider) };
}
