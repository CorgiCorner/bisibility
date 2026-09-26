import "server-only";

import { notifyOps } from "@/lib/ops/notify";
import { PROVIDER_USAGE_OVERDUE_THRESHOLD_MS } from "./reconcile";
import { providerUsageFreshness } from "./usage-freshness";

/** Runs outside the reconciliation workflow, so a stalled schedule cannot hide itself. */
export async function monitorProviderUsageReconciliation(startedAt: Date, now = new Date()) {
  const freshness = await providerUsageFreshness(undefined, { now });
  if (freshness.status === "fresh") return;
  // A new deployment gets one full freshness window to complete its first sweep.
  if (now.getTime() - startedAt.getTime() <= PROVIDER_USAGE_OVERDUE_THRESHOLD_MS) return;
  await notifyOps({
    dedupeKey: "provider_usage_reconciliation_stale",
    fields: { "Last completed sweep": freshness.lastReconciledAt ?? "not recorded" },
    kind: "provider_usage_reconciliation_stale",
    severity: "error",
    title: "Provider usage reconciliation has not completed within 15 minutes",
  });
}
