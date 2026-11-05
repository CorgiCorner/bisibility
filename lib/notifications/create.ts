import "server-only";

import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import { NotificationType, Prisma } from "@/lib/generated/prisma/client";
import { z } from "zod";
import { guardedNotificationType, notificationDeliveryAllowed } from "./delivery-guard";
import type { NotificationPayload } from "./format";
import { publishNotificationCreated } from "./realtime";
import { notificationStoredCopy } from "./stored-copy";
import { queueNotificationEvent } from "./transaction";

const notificationPayloadSchema: z.ZodType<NotificationPayload> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(notificationPayloadSchema),
    z.record(z.string(), notificationPayloadSchema),
  ]),
);

const createNotificationSchema = z.object({
  body: z.string().trim().max(500).nullable().optional(),
  idempotencyKey: z.string().trim().min(1).max(200).nullable().optional(),
  payload: notificationPayloadSchema.optional(),
  projectId: z.string().min(1).nullable(),
  title: z.string().trim().min(1).max(160),
  type: z.enum(NotificationType),
  userId: z.string().min(1),
});

function prismaPayload(value: NotificationPayload | undefined) {
  if (value === undefined) {
    return undefined;
  }

  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

/** Shared validation and stored copy for single and batched notification writes. */
export function notificationCreateData(input: z.input<typeof createNotificationSchema>) {
  const data = createNotificationSchema.parse(input);
  return {
    ...notificationStoredCopy(data.type, data.title, data.body),
    idempotencyKey: data.idempotencyKey ?? null,
    payload: prismaPayload(data.payload),
    publicId: makePublicId("ntf"),
    projectId: data.projectId,
    type: data.type,
    userId: data.userId,
  };
}

export async function createNotification(
  userId: string,
  projectId: string | null,
  type: NotificationType,
  title: string,
  body?: string | null,
  payload?: NotificationPayload,
  idempotencyKey?: string | null,
  transaction?: Prisma.TransactionClient,
) {
  const data = createNotificationSchema.parse({
    body,
    idempotencyKey,
    payload,
    projectId,
    title,
    type,
    userId,
  });

  const persist = async (db: Prisma.TransactionClient) => {
    if (!(await notificationDeliveryAllowed(db, data.userId, data.projectId, data.type)))
      return null;
    try {
      const query = {
        data: notificationCreateData(data),
        select: {
          body: true,
          createdAt: true,
          id: true,
          payload: true,
          projectId: true,
          readAt: true,
          title: true,
          type: true,
          userId: true,
        },
      } satisfies Prisma.NotificationCreateArgs;
      // ON CONFLICT avoids aborting an enclosing transaction on recipient replay.
      return transaction
        ? ((await db.notification.createManyAndReturn({ ...query, skipDuplicates: true }))[0] ??
            null)
        : await db.notification.create(query);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return null;
      }
      throw error;
    }
  };
  const notification = transaction
    ? await persist(transaction)
    : guardedNotificationType(data.type)
      ? await prisma.$transaction(persist)
      : await persist(prisma);

  if (!notification) {
    return null;
  }

  const event = {
    createdAt: notification.createdAt.toISOString(),
    id: notification.id,
    kind: "created" as const,
    projectId: notification.projectId,
    userId: notification.userId,
  };
  if (transaction) queueNotificationEvent(transaction, event);
  else await publishNotificationCreated(event);

  return notification;
}
