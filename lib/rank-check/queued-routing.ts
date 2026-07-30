import "server-only";

import { prisma } from "@/lib/db/prisma";
import { resolveProviderCredentials } from "@/lib/providers/credentials";
import { isRankCheckDispatcherEnabled } from "./dispatcher-config";
import type { ClaimedRankCheckGroup } from "./dispatcher-types";
import { serpProviderChainOrderBy } from "./provider-chain-order";
import { queuedRankCheckConfig } from "./queued-config";

export type QueuedRankCheckRoute =
  | { mode: "deferred"; reason: string }
  | { mode: "legacy"; reason: string }
  | { mode: "queued"; provider: "dataforseo" };

export async function queuedRankCheckRoute(
  group: ClaimedRankCheckGroup,
): Promise<QueuedRankCheckRoute> {
  if (!isRankCheckDispatcherEnabled()) {
    return { mode: "legacy", reason: "dispatcher_disabled" };
  }
  const config = queuedRankCheckConfig();
  if (!config.enabled) {
    return { mode: "legacy", reason: "queued_dataforseo_disabled" };
  }
  const project = await prisma.project.findUnique({
    include: {
      owner: { select: { deactivatedAt: true } },
      providerConnections: {
        orderBy: serpProviderChainOrderBy(),
        where: { enabled: true, kind: "serp", status: "connected" },
      },
    },
    where: { id: group.projectId },
  });
  if (project?.writeMode !== "active" || project.owner.deactivatedAt) {
    return { mode: "deferred", reason: "project_ineligible" };
  }
  const primary = project.providerConnections[0];
  if (primary?.provider !== "dataforseo") {
    return { mode: "legacy", reason: "primary_provider_not_dataforseo" };
  }
  try {
    const credentials = resolveProviderCredentials("dataforseo", primary.credentialsEncrypted);
    if (!credentials.login || !credentials.password) {
      return { mode: "deferred", reason: "credentials_unavailable" };
    }
  } catch {
    return { mode: "deferred", reason: "credentials_unavailable" };
  }
  return { mode: "queued", provider: "dataforseo" };
}
