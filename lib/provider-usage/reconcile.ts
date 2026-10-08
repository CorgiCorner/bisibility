import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import { notifyOps } from "@/lib/ops/notify";
import { recordProviderUsage } from "@/lib/provider-usage/recorder";
import type { ProviderRequestAttribution } from "@/lib/provider-usage/tag";
import { queuedBatchAttribution } from "@/lib/rank-check/queued-attribution";
import {
  pendingUnknownReceipts,
  repairMissingByokReceipt,
  settlePendingUnknownReceipt,
} from "./reconcile-pending";

export const PROVIDER_USAGE_RECONCILED_AT_SETTING_KEY = "provider_usage_reconciled_at";
export const PROVIDER_USAGE_OVERDUE_THRESHOLD_MS = 15 * 60_000;
export const PROVIDER_USAGE_UNCONFIRMED_DEDUPE_KEY = "provider_usage_unconfirmed";

const DEFAULT_RECEIPT_LIMIT = 100;
const MAX_RECEIPT_LIMIT = 100;

type ProviderUsageReceiptRow = {
  billingAt: Date;
  connectionId: string;
  costCents: string | number;
  credentialId: string | null;
  credentialKind: string | null;
  entryId: string | null;
  keywordId: string;
  projectId: string;
  provider: string;
  providerRequestId: string;
  providerTag: string;
  source: string | null;
  taskId: string;
  trigger: string | null;
};

export type ProviderUsageReconcileClient = {
  $transaction: PrismaClient["$transaction"];
  $queryRaw: Prisma.TransactionClient["$queryRaw"];
  providerCostEntry: Pick<
    Prisma.TransactionClient["providerCostEntry"],
    "count" | "createMany" | "deleteMany" | "findFirst" | "update"
  >;
  instanceSetting: Pick<Prisma.TransactionClient["instanceSetting"], "upsert">;
};

export type ProviderUsageReconciliationResult = {
  hasMore: boolean;
  lastReconciledAt: string | null;
  overdue: number;
  reconciled: number;
  scanned: number;
  unconfirmed: number;
};

function boundedReceiptLimit(value: number | undefined) {
  if (!Number.isInteger(value) || !value) return DEFAULT_RECEIPT_LIMIT;
  return Math.min(MAX_RECEIPT_LIMIT, Math.max(1, value));
}

function receiptAttribution(receipt: ProviderUsageReceiptRow): ProviderRequestAttribution {
  const origin = queuedBatchAttribution({
    credentialId: receipt.credentialId,
    credentialKind: receipt.credentialKind,
    source: receipt.source,
    trigger: receipt.trigger,
  });
  return {
    context: {
      correlationId: receipt.taskId,
      feature: "rank_check",
      projectId: receipt.projectId,
      source: origin.source,
      trigger: origin.trigger,
    },
    ...(origin.credential ? { credential: origin.credential } : {}),
    tag: receipt.providerTag,
  };
}

async function missingReceipts(client: ProviderUsageReconcileClient, fetchLimit: number) {
  return client.$queryRaw<ProviderUsageReceiptRow[]>(Prisma.sql`
    SELECT
      b."connectionId" AS "connectionId",
      -- Provider billing timestamp: the batch's actual submission time, or the
      -- task's accepted creation time for legacy batches that never recorded
      -- a submission. Never the reconciliation wall clock, which would move
      -- spend into the wrong billing period.
      COALESCE(b."submittedAt", t."createdAt") AS "billingAt",
      evidence.id AS "entryId",
      t."costCents" AS "costCents",
      b."credentialId" AS "credentialId",
      b."credentialKind" AS "credentialKind",
      t."keywordId" AS "keywordId",
      b."projectId" AS "projectId",
      b."provider" AS "provider",
      t."providerTaskId" AS "providerRequestId",
      t."providerTag" AS "providerTag",
      b."source" AS "source",
      t."id" AS "taskId",
      b."trigger" AS "trigger"
    FROM "queued_rank_check_tasks" t
    JOIN "queued_rank_check_batches" b ON b."id" = t."batchId"
    LEFT JOIN LATERAL (
      SELECT CASE WHEN count(*)=1 THEN min(u.id) ELSE NULL END AS id
      FROM metering_usage_evidence u
      WHERE u."connectionId"=b."connectionId" AND u."projectId"=b."projectId"
        AND u."correlationId"=t.id AND u.provider=b.provider AND u.discarded=false
        AND u."canonicalId" IS NULL
        AND (u."providerRequestId" IS NULL OR u."providerRequestId"=t."providerTaskId")
    ) evidence ON TRUE
    WHERE t."providerTaskId" IS NOT NULL
      AND t."costCents" IS NOT NULL
      AND t."providerTag" IS NOT NULL
      AND b."connectionId" IS NOT NULL
      -- Original transport attribution, never the connection's present funding source.
      AND t."providerTag" LIKE '%;cs=own;%'
      AND NOT EXISTS (
        SELECT 1
        FROM "provider_cost_entries" e
        WHERE e."connectionId" = b."connectionId"
          AND e."providerRequestId" = t."providerTaskId"
      )
    ORDER BY t."updatedAt" ASC, t."id" ASC
    LIMIT ${fetchLimit}
  `);
}

export async function reconcileProviderUsage(
  client: ProviderUsageReconcileClient = prisma,
  options: { limit?: number } = {},
): Promise<ProviderUsageReconciliationResult> {
  const limit = boundedReceiptLimit(options.limit);
  const now = new Date();
  const pending = await pendingUnknownReceipts(client, limit + 1);
  let reconciled = 0;
  for (const row of pending.slice(0, limit)) {
    if (await settlePendingUnknownReceipt(client, row)) reconciled += 1;
  }
  const remaining = limit - Math.min(pending.length, limit);
  const fetched = await missingReceipts(client, remaining + 1);
  const hasMore = fetched.length > remaining || pending.length > limit;
  const receipts = fetched.slice(0, remaining);
  for (const receipt of receipts) {
    const input = {
      attribution: receiptAttribution(receipt),
      createdAt: receipt.billingAt,
      connectionId: receipt.connectionId,
      costCents: Number(receipt.costCents),
      failed: false,
      keywordId: receipt.keywordId,
      projectId: receipt.projectId,
      provider: receipt.provider,
      providerRequestId: receipt.providerRequestId,
      usageQuantity: 1,
    };
    const status = receipt.entryId
      ? await repairMissingByokReceipt(client, receipt.entryId, input)
      : await recordProviderUsage(client, input);
    if (status.status !== "skipped") reconciled += 1;
  }
  const unconfirmed = await client.providerCostEntry.count({
    where: { measurementStatus: "unknown" },
  });
  const overdueAt = new Date(now.getTime() - PROVIDER_USAGE_OVERDUE_THRESHOLD_MS);
  const overdue =
    unconfirmed > 0
      ? await client.providerCostEntry.count({
          where: { createdAt: { lt: overdueAt }, measurementStatus: "unknown" },
        })
      : 0;
  if (overdue > 0) {
    const oldest = await client.providerCostEntry.findFirst({
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
      where: { createdAt: { lt: overdueAt }, measurementStatus: "unknown" },
    });
    const oldestAgeMinutes = Math.max(
      0,
      Math.round((now.getTime() - (oldest?.createdAt.getTime() ?? now.getTime())) / 60_000),
    );
    await notifyOps({
      dedupeKey: PROVIDER_USAGE_UNCONFIRMED_DEDUPE_KEY,
      fields: {
        "Oldest age minutes": oldestAgeMinutes,
        "Overdue entries": overdue,
        "Unconfirmed total": unconfirmed,
      },
      kind: "provider_usage_unconfirmed",
      severity: "warning",
      title: `Provider usage reconciliation found ${overdue} unconfirmed entries older than 15 minutes`,
    });
  }
  let lastReconciledAt: string | null = null;
  if (!hasMore) {
    lastReconciledAt = now.toISOString();
    await client.instanceSetting.upsert({
      create: { key: PROVIDER_USAGE_RECONCILED_AT_SETTING_KEY, value: lastReconciledAt },
      update: { value: lastReconciledAt },
      where: { key: PROVIDER_USAGE_RECONCILED_AT_SETTING_KEY },
    });
  }
  return {
    hasMore,
    lastReconciledAt,
    overdue,
    reconciled,
    scanned: receipts.length + Math.min(pending.length, limit),
    unconfirmed,
  };
}
