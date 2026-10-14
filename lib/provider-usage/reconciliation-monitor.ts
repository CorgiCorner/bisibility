import "server-only";

import { prisma } from "@/lib/db/prisma";
import { meteringNamespace } from "@/lib/metering/runtime";
import { notifyOps } from "@/lib/ops/notify";
import { providerUsageOpsKey } from "./ops-identity";
import { PROVIDER_USAGE_OVERDUE_THRESHOLD_MS } from "./reconcile";
import { readReconciliationHealth } from "./reconciliation-health";

/** Runs outside the reconciliation workflow, so a stalled schedule cannot hide itself. */
export async function monitorProviderUsageReconciliation(startedAt: Date, now = new Date()) {
  const namespace = meteringNamespace();
  const health = await readReconciliationHealth(prisma, namespace);
  const activityAt = Date.parse(health?.lastActivityAt ?? "");
  if (
    Number.isFinite(activityAt) &&
    activityAt <= now.getTime() &&
    now.getTime() - activityAt <= PROVIDER_USAGE_OVERDUE_THRESHOLD_MS
  )
    return;
  // A new deployment gets one full freshness window to complete its first sweep.
  if (now.getTime() - startedAt.getTime() <= PROVIDER_USAGE_OVERDUE_THRESHOLD_MS) return;
  await notifyOps({
    dedupeKey: providerUsageOpsKey("provider_usage_reconciliation_stale", namespace),
    fields: {
      "Last completed sweep": health?.lastCompletedAt ?? "not recorded",
      "Last activity": health?.lastActivityAt ?? "not recorded",
    },
    kind: "provider_usage_reconciliation_stale",
    severity: "error",
    title: "Provider usage reconciliation has not made progress within 15 minutes",
  });
}
