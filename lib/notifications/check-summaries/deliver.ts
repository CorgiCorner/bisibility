import "server-only";
import { isDeepStrictEqual } from "node:util";
import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { notificationDeliveryAllowed } from "@/lib/notifications/delivery-guard";
import type { NotificationPayload } from "@/lib/notifications/format";
import {
  notificationPreferenceSelect,
  resolveNotificationPreferences,
} from "@/lib/notifications/preference-defaults";
import { notificationTransaction } from "@/lib/notifications/transaction";
import { upsertNotification } from "@/lib/notifications/upsert";
import { withdrawNotification } from "@/lib/notifications/withdraw";
import { aggregateChecks } from "./aggregate";
import { collectSummary, type SummaryTarget } from "./collect";
import { summaryAction } from "./significance";
import { checkNotificationSummariesEnabled } from "./switch";
import { summaryWritable } from "./window";

export function summaryKey(target: SummaryTarget) {
  return target.kind === "manual"
    ? `check-run:${target.runId}`
    : `check-window:${target.projectId}:${target.window.start.toISOString()}`;
}

/** Reads and recomputation share a per-key transaction lock across every worker. */
export async function recomputeCheckSummary(
  target: SummaryTarget,
  options: { now?: Date; database?: PrismaClient } = {},
) {
  if (!checkNotificationSummariesEnabled()) return 0;
  const clock = () => options.now ?? new Date();
  return notificationTransaction(
    async (tx) => {
      const key = summaryKey(target);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
      const collected = await collectSummary(tx, target);
      if (!collected || !summaryWritable(collected.end, clock())) return 0;
      const project = await tx.project.findUnique({
        where: { id: target.projectId },
        select: { publicId: true, ownerId: true, members: { select: { userId: true } } },
      });
      if (!project) return 0;
      const recipients =
        target.kind === "manual"
          ? [collected.requesterId!]
          : [...new Set([project.ownerId, ...project.members.map((m) => m.userId)])];
      const type = target.kind === "manual" ? "manual_run_summary" : "scheduled_window_summary";
      let writes = 0;
      for (const userId of recipients) {
        if (!(await notificationDeliveryAllowed(tx, userId, target.projectId, type))) continue;
        const prefs = resolveNotificationPreferences(
          await tx.notificationPreference.findUnique({
            where: { userId_projectId: { userId, projectId: target.projectId } },
            select: notificationPreferenceSelect,
          }),
        );
        const thresholds = {
          topN: prefs.checkNotificationTopN,
          positionMove: prefs.checkNotificationPositionMove,
        };
        const delivered = await tx.notification.findMany({
          where: {
            userId,
            projectId: target.projectId,
            type: "provider_incident",
            withdrawnAt: null,
            idempotencyKey: {
              in: [...new Set(collected.checks.flatMap((c) => c.incidentIds))].map(
                (id) => `provider-incident:${id}`,
              ),
            },
          },
          select: { idempotencyKey: true },
        });
        const aggregation = aggregateChecks({
          ...collected,
          window: target.kind === "scheduled" ? target.window : undefined,
          thresholds,
          deliveredIncidentIds: new Set(
            delivered.map((n) => n.idempotencyKey!.slice("provider-incident:".length)),
          ),
        });
        await tx.$queryRaw`SELECT id FROM notifications WHERE "userId"=${userId} AND "idempotencyKey"=${key} FOR UPDATE`;
        const existing = await tx.notification.findUnique({
          where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
        });
        const action = summaryAction({
          mode: prefs.checkNotificationSetting,
          manual: target.kind === "manual",
          count: aggregation.checkIds.length,
          significant: aggregation.significant,
          existing,
        });
        if (action === "skip") continue;
        const payload: NotificationPayload = {
          kind: target.kind,
          windowStart: collected.start.toISOString(),
          windowEnd: collected.end.toISOString(),
          runPublicId: collected.runPublicId,
          counts: aggregation.counts,
          entries: aggregation.entries,
          thresholds,
          linkedIncidentIds: aggregation.incidentIds,
          href: `/app/${project.publicId}/runs`,
          linkTarget:
            target.kind === "manual"
              ? { run: collected.runPublicId }
              : {
                  from: collected.start.toISOString(),
                  to: collected.end.toISOString(),
                  trigger: "scheduled",
                },
        };
        if (!summaryWritable(collected.end, clock())) continue;
        if (
          !existing ||
          !isDeepStrictEqual(existing.payload, payload) ||
          (action === "upsert" && existing.withdrawnAt)
        ) {
          const result = await upsertNotification(
            {
              userId,
              projectId: target.projectId,
              type,
              title: target.kind === "manual" ? "Manual check summary" : "Scheduled check summary",
              payload,
              idempotencyKey: key,
              version: (existing?.version ?? 0) + 1,
            },
            tx,
          );
          if (!result.notification) continue;
          writes++;
          if (action === "upsert" && existing?.withdrawnAt)
            await tx.notification.update({
              where: { id: result.notification.id },
              data: { withdrawnAt: null },
            });
          await tx.checkNotificationSummary.upsert({
            where: { notificationId: result.notification.id },
            create: {
              notificationId: result.notification.id,
              checkIds: aggregation.checkIds,
              ...thresholds,
              version: result.notification.version,
            },
            update: {
              checkIds: aggregation.checkIds,
              ...thresholds,
              version: result.notification.version,
              withdrawn: false,
            },
          });
        }
        if (action === "withdraw") {
          writes += await withdrawNotification({ userId, idempotencyKey: key }, tx);
          const withdrawn = await tx.notification.findUniqueOrThrow({
            where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
          });
          await tx.checkNotificationSummary.update({
            where: { notificationId: withdrawn.id },
            data: { withdrawn: true, version: withdrawn.version },
          });
        }
      }
      return writes;
    },
    { timeout: 30_000 },
    options.database ?? prisma,
  );
}
