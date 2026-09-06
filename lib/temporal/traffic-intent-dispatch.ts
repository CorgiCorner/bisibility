import "server-only";

import { prisma } from "../db/prisma";
import { claimFirstTrafficSyncIntent } from "../traffic/first-sync-intent-claim";
import { startFirstTrafficSyncWorkflow } from "./traffic-first-sync-client";
import { isTrafficSyncEnabled } from "./traffic-sync-enabled";

type DispatchOptions = {
  claim?: typeof claimFirstTrafficSyncIntent;
  start?: typeof startFirstTrafficSyncWorkflow;
};

export async function dispatchFirstTrafficSyncIntent(options: DispatchOptions = {}) {
  if (!isTrafficSyncEnabled()) return { status: "disabled" as const };
  const claim = await (options.claim ?? claimFirstTrafficSyncIntent)();
  if (!claim) return { status: "idle" as const };
  try {
    const started = await (options.start ?? startFirstTrafficSyncWorkflow)(claim);
    return { connectionId: claim.id, status: "started" as const, workflowId: started.workflowId };
  } catch (error) {
    await prisma.providerConnection.updateMany({
      data: { firstSyncStartedAt: null },
      where: {
        firstSyncFinishedAt: null,
        firstSyncRequestedAt: claim.firstSyncRequestedAt,
        firstSyncStartedAt: claim.firstSyncStartedAt,
        id: claim.id,
      },
    });
    console.error("[traffic] first-sync workflow dispatch failed", {
      connectionId: claim.id,
      error,
      projectId: claim.projectId,
    });
    return { connectionId: claim.id, status: "failed" as const };
  }
}
