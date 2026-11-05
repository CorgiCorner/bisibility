import "server-only";
import type { AlertExternalDeliveryPayload } from "@/lib/alerts/alert-delivery-payload";
import { NotificationType, type Prisma } from "@/lib/generated/prisma/client";
import { appPath } from "@/lib/routing/app-path";
import { notificationCreateData } from "./create";
import { queueNotificationEvent } from "./transaction";

export type TriggeredAlertNotificationInput = {
  payload: AlertExternalDeliveryPayload;
  projectInternalId: string;
  triggeredAlertId: string;
};

export function triggeredAlertNotificationInput(input: TriggeredAlertNotificationInput) {
  const { payload } = input;
  return {
    body: payload.action,
    hrefSegments: ["alerts"],
    idempotencyKey: `triggered-alert:${input.triggeredAlertId}:delivered`,
    payload: {
      afterPosition: payload.afterPosition,
      alertId: payload.alertId,
      beforePosition: payload.beforePosition,
      conditionType: payload.conditionType,
      firedAt: payload.firedAt,
      keyword: payload.keyword,
      keywordId: payload.keywordId,
      meta: `${payload.keyword} on ${payload.projectDomain}`,
      ruleId: payload.ruleId,
      ruleName: payload.ruleName,
    },
    projectId: input.projectInternalId,
    title: payload.headline,
    type: NotificationType.alert_fired,
  };
}

const INSERT_BATCH_SIZE = 500;

/** The transaction owns eligibility and project locking; realtime flushes only after commit. */
export async function notifyTriggeredAlertsDelivered(
  projectId: string,
  inputs: Array<Omit<TriggeredAlertNotificationInput, "projectInternalId">>,
  tx: Prisma.TransactionClient,
) {
  if (inputs.length === 0) return;
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: { publicId: true, ownerId: true, members: { select: { userId: true } } },
  });
  if (!project) return;
  const userIds = [...new Set([project.ownerId, ...project.members.map((m) => m.userId)])];
  const optedOut = new Set(
    (
      await tx.notificationPreference.findMany({
        where: { projectId, alertInApp: false },
        select: { userId: true },
      })
    ).map((p) => p.userId),
  );
  const recipients = userIds.filter((id) => !optedOut.has(id));
  const batch: Prisma.NotificationCreateManyInput[] = [];
  const flush = async () => {
    const rows = await tx.notification.createManyAndReturn({
      data: batch,
      skipDuplicates: true,
      select: { id: true, userId: true, projectId: true, createdAt: true },
    });
    for (const row of rows) {
      queueNotificationEvent(tx, {
        id: row.id,
        userId: row.userId,
        projectId: row.projectId,
        createdAt: row.createdAt.toISOString(),
        kind: "created",
      });
    }
    batch.length = 0;
  };
  for (const input of inputs) {
    const notification = triggeredAlertNotificationInput({
      ...input,
      projectInternalId: projectId,
    });
    for (const userId of recipients) {
      batch.push(
        notificationCreateData({
          ...notification,
          userId,
          payload: {
            ...notification.payload,
            href: appPath(project.publicId, "alerts"),
            idempotencyKey: notification.idempotencyKey,
          },
        }),
      );
      if (batch.length === INSERT_BATCH_SIZE) await flush();
    }
  }
  if (batch.length) await flush();
}
