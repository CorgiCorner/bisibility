import "server-only";
import { randomUUID } from "node:crypto";
import { hasNotificationResult } from "@/lib/activity/result-payload";
import { recordResultReceipt } from "@/lib/activity/result-receipt-extension";
import { makePublicId } from "@/lib/db/public-id";
import type { Notification, NotificationType, Prisma } from "@/lib/generated/prisma/client";
import { z } from "zod";
import { notificationDeliveryAllowed } from "./delivery-guard";
import type { NotificationPayload } from "./format";
import { notificationStoredCopy } from "./stored-copy";
import {
  notificationTransaction,
  queueNotificationAfterCommit,
  queueNotificationEvent,
} from "./transaction";

export type VersionedNotification = {
  userId: string;
  projectId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  payload: NotificationPayload;
  idempotencyKey: string;
  version: number;
  addedUnresolvedOperation?: boolean;
  unresolvedAddedVersion?: number;
};

/** Only a newly linked unresolved operation makes an existing incident unread. */
export function incidentUpdateMarksUnread(
  type: NotificationType,
  addedUnresolvedOperation: boolean,
) {
  return type === "provider_incident" && addedUnresolvedOperation;
}

export async function upsertNotification(
  input: VersionedNotification,
  transaction?: Prisma.TransactionClient,
) {
  z.number().int().min(1).max(2147483647).parse(input.version);
  z.string().trim().min(1).max(200).parse(input.idempotencyKey);
  z.string().trim().min(1).max(160).parse(input.title);
  if (input.unresolvedAddedVersion !== undefined)
    z.number().int().min(0).max(input.version).parse(input.unresolvedAddedVersion);
  const copy = notificationStoredCopy(input.type, input.title, input.body);
  const persist = async (tx: Prisma.TransactionClient) => {
    if (!(await notificationDeliveryAllowed(tx, input.userId, input.projectId, input.type)))
      return { status: "blocked" as const, notification: null };
    const unreadVersion =
      input.unresolvedAddedVersion ?? (input.addedUnresolvedOperation ? input.version : 0);
    const unread = incidentUpdateMarksUnread(input.type, unreadVersion > 0);
    const rows = await tx.$queryRaw<Array<Notification & { inserted: boolean }>>`
      INSERT INTO notifications (id, "publicId", "userId", "projectId", type, title, body, payload,
        "idempotencyKey", version, "createdAt", "updatedAt")
      VALUES (${randomUUID()}, ${makePublicId("ntf")}, ${input.userId}, ${input.projectId},
        ${input.type}::"NotificationType", ${copy.title}, ${copy.body},
        ${JSON.stringify(input.payload)}::jsonb, ${input.idempotencyKey}, ${input.version}, now(), now())
      ON CONFLICT ("userId", "idempotencyKey") DO UPDATE SET
        title=EXCLUDED.title, body=EXCLUDED.body, payload=EXCLUDED.payload,
        version=EXCLUDED.version, "updatedAt"=clock_timestamp(),
        "readAt"=CASE WHEN ${unread} AND notifications.version < ${unreadVersion} THEN NULL ELSE notifications."readAt" END
      WHERE notifications.version < EXCLUDED.version
      RETURNING *, (xmax = 0) AS inserted`;
    const row = rows[0];
    if (!row) return { status: "stale" as const, notification: null };
    queueNotificationAfterCommit(tx, async () => {
      recordResultReceipt({
        userId: row.userId,
        surface: "alert",
        nonEmpty: hasNotificationResult(input.type, input.payload),
      });
    });
    queueNotificationEvent(tx, {
      id: row.id,
      userId: row.userId,
      projectId: row.projectId,
      createdAt: row.createdAt.toISOString(),
      kind: row.inserted ? "created" : "updated",
    });
    return {
      status: row.inserted ? ("inserted" as const) : ("updated" as const),
      notification: row,
    };
  };
  return transaction ? persist(transaction) : notificationTransaction(persist);
}
