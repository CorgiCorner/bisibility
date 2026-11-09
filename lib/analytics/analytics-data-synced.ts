import "server-only";

import { pendingConsent } from "@/lib/analytics/consent";
import { trackServerEvent } from "@/lib/analytics/server";
import { prisma } from "@/lib/db/prisma";
import { v5 as uuidv5 } from "uuid";
import { queueRequestUsageTask } from "./request-usage-delivery";

type AnalyticsProvider = "gsc" | "ga4" | "plausible";
type Trigger = "manual" | "scheduled" | "api" | "unknown";

/** Call only after a successful sync has stored provider rows. */
export function queueAnalyticsDataSynced(input: {
  connectionId: string;
  projectId: string;
  actorId?: string | null;
  provider: AnalyticsProvider;
  trigger: Trigger;
  rowsStored: number;
}) {
  if (input.rowsStored <= 0) return;
  try {
    queueRequestUsageTask(async () => {
      const owner = input.actorId
        ? null
        : await prisma.project.findUnique({
            where: { id: input.projectId },
            select: { ownerId: true },
          });
      const userId = input.actorId ?? owner?.ownerId;
      if (!userId) return;
      const claim = await prisma.providerConnection.updateMany({
        where: { id: input.connectionId, analyticsDataSyncedAt: null },
        data: { analyticsDataSyncedAt: new Date() },
      });
      if (claim.count !== 1) return;
      await trackServerEvent("analytics_data_synced", {
        consent: pendingConsent(),
        userId,
        uuid: uuidv5(`bisibility/analytics-data-synced/${input.connectionId}`, uuidv5.URL),
        properties: { provider: input.provider, trigger: input.trigger },
      });
    });
  } catch {
    // Product operations do not depend on analytics scheduling.
  }
}
