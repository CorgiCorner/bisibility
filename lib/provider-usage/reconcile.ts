import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { meteringNamespace } from "@/lib/metering/runtime";
import { notifyOps } from "@/lib/ops/notify";
import { providerUsageOpsKey } from "./ops-identity";
import { recoverPage } from "./reconcile-progress";
import { planRecoveryNotice } from "./recovery-notification-policy";

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
  const [failedNotice, overdueNotice] = await client.$transaction(async (tx) => [
    await planRecoveryNotice(tx, namespace, "failed", result.failed, now),
    await planRecoveryNotice(tx, namespace, "overdue", result.overdue, now),
  ]);
  if (failedNotice.notice)
    await notifyOps({
      dedupeKey: `${providerUsageOpsKey("provider_usage_recovery_failed", namespace)}:${failedNotice.fingerprint}:${failedNotice.notice}:${now.toISOString().slice(0, 10)}`,
      kind: "provider_usage_recovery_failed",
      severity: failedNotice.notice === "resolved" ? "info" : "error",
      title:
        failedNotice.notice === "resolved"
          ? "Provider usage recovery failures resolved"
          : failedNotice.notice === "digest"
            ? "Provider usage recovery daily digest: failed candidates remain"
            : "Provider usage recovery has failed candidates",
      fields: {
        "Failed recoveries": result.failed,
        Namespace: namespace,
        "Recovery console": `${process.env.SITE_URL ?? ""}/app/admin/metering/recovery`,
      },
    });
  if (overdueNotice.notice)
    await notifyOps({
      dedupeKey: `${providerUsageOpsKey(PROVIDER_USAGE_UNCONFIRMED_DEDUPE_KEY, namespace)}:${overdueNotice.fingerprint}:${overdueNotice.notice}:${now.toISOString().slice(0, 10)}`,
      kind: "provider_usage_unconfirmed",
      severity: overdueNotice.notice === "resolved" ? "info" : "warning",
      title:
        overdueNotice.notice === "resolved"
          ? "Provider usage reconciliation overdue backlog resolved"
          : overdueNotice.notice === "digest"
            ? `Provider usage daily digest: ${result.overdue} overdue unconfirmed entries remain`
            : `Provider usage reconciliation found ${result.overdue} unconfirmed entries older than 15 minutes`,
      fields: {
        "Oldest age minutes": Math.max(
          0,
          Math.round((now.getTime() - (result.oldest?.getTime() ?? now.getTime())) / 60000),
        ),
        "Overdue entries": result.overdue,
        "Unconfirmed total": result.unconfirmed,
        Namespace: namespace,
        "Recovery console": `${process.env.SITE_URL ?? ""}/app/admin/metering/recovery`,
      },
    });
  const { oldest: _, ...response } = result;
  return response;
}
