import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { meteringNamespace } from "@/lib/metering/runtime";
import { notifyOps } from "@/lib/ops/notify";
import { recoverPage } from "./reconcile-progress";

export const PROVIDER_USAGE_RECONCILED_AT_SETTING_KEY = "provider_usage_reconciled_at";
export const PROVIDER_USAGE_OVERDUE_THRESHOLD_MS = 15 * 60_000;
export const PROVIDER_USAGE_UNCONFIRMED_DEDUPE_KEY = "provider_usage_unconfirmed";
export type ProviderUsageReconcileClient = Pick<PrismaClient, "$transaction">;
export type ProviderUsageReconciliationResult = {
  hasMore: boolean;
  lastReconciledAt: string | null;
  overdue: number;
  reconciled: number;
  scanned: number;
  failed: number;
  unconfirmed: number;
};
export async function reconcileProviderUsage(
  client: ProviderUsageReconcileClient = prisma,
  options: { limit?: number; namespace?: string } = {},
): Promise<ProviderUsageReconciliationResult> {
  const limit =
    Number.isInteger(options.limit) && options.limit
      ? Math.min(100, Math.max(1, options.limit ?? 100))
      : 100;
  const now = new Date(),
    namespace = options.namespace ?? meteringNamespace();
  const result = await recoverPage(
    client,
    namespace,
    now,
    limit,
    PROVIDER_USAGE_RECONCILED_AT_SETTING_KEY,
  );
  if (result.failed > 0)
    await notifyOps({
      dedupeKey: "provider_usage_recovery_failed",
      kind: "provider_usage_recovery_failed",
      severity: "error",
      title: "Provider usage recovery has failed candidates",
      fields: { "Failed recoveries": result.failed, Namespace: namespace },
    });
  if (result.overdue > 0)
    await notifyOps({
      dedupeKey: PROVIDER_USAGE_UNCONFIRMED_DEDUPE_KEY,
      kind: "provider_usage_unconfirmed",
      severity: "warning",
      title: `Provider usage reconciliation found ${result.overdue} unconfirmed entries older than 15 minutes`,
      fields: {
        "Oldest age minutes": Math.max(
          0,
          Math.round((now.getTime() - (result.oldest?.getTime() ?? now.getTime())) / 60000),
        ),
        "Overdue entries": result.overdue,
        "Unconfirmed total": result.unconfirmed,
      },
    });
  const { oldest: _, ...response } = result;
  return response;
}
