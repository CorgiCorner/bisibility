import "server-only";

import type { GscSearchAnalyticsSession } from "@/lib/providers/analytics/gsc-search-analytics";
import { formatDayComplete, logSyncInfo } from "./activity-log";
import { PARTITION_DIMENSION_SETS, syncDayPartition } from "./partitions";

export async function syncCompleteGscDay(input: {
  date: string;
  projectId: string;
  property: string;
  session: GscSearchAnalyticsSession;
}) {
  let capHit = false;
  for (const dimensions of PARTITION_DIMENSION_SETS) {
    const provenance = await syncDayPartition({ ...input, dimensions });
    capHit = capHit || provenance.capHit;
  }
  logSyncInfo(formatDayComplete(input.date));
  return { capHit, requestSets: PARTITION_DIMENSION_SETS.length };
}
