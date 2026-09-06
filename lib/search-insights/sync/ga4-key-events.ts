import "server-only";

import { prisma } from "@/lib/db/prisma";
import { readGa4KeyEventsConfigured } from "@/lib/providers/analytics/ga4-admin";
import type { ProviderCredentials } from "@/lib/providers/types";
import { providerChainWhere } from "@/lib/rank-check/provider-chain-order";
import { ORGANIC_SESSIONS_SOURCE, resolveOrganicSessionsConnection } from "./sessions-credentials";

export async function cacheGa4KeyEventsConfiguration(input: {
  credentials: ProviderCredentials;
  now: Date;
  projectId: string;
  property: string;
}): Promise<boolean | null> {
  const keyEventsConfigured = await readGa4KeyEventsConfigured(input.credentials);
  if (keyEventsConfigured === null) return null;

  await prisma.searchAnalyticsImport.update({
    data: {
      keyEventsCheckedAt: input.now,
      keyEventsConfigured,
    },
    where: {
      projectId_property_source: {
        projectId: input.projectId,
        property: input.property,
        source: "ga4",
      },
    },
  });
  return keyEventsConfigured;
}

export async function cacheGa4KeyEventsConfigurationsForAllProjects(now: Date) {
  const projects = await prisma.project.findMany({
    select: { id: true },
    where: {
      providerConnections: {
        some: { ...providerChainWhere("analytics"), provider: ORGANIC_SESSIONS_SOURCE },
      },
    },
  });
  for (const project of projects) {
    const connection = await resolveOrganicSessionsConnection(project.id);
    if (!connection) continue;
    try {
      await cacheGa4KeyEventsConfiguration({
        credentials: connection.credentials,
        now,
        projectId: project.id,
        property: connection.property,
      });
    } catch (error) {
      console.error("[search-insights] key events cache failed", { error, projectId: project.id });
    }
  }
}
