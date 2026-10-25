import "server-only";

import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import { NotificationType, Prisma } from "@/lib/generated/prisma/client";
import { z } from "zod";
import { guardedNotificationType, notificationDeliveryAllowed } from "./delivery-guard";
import type { NotificationPayload } from "./format";
import { publishNotificationCreated } from "./realtime";
import { notificationStoredCopy } from "./stored-copy";

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

export async function createNotification(
  userId: string,
  projectId: string | null,
  type: NotificationType,
  title: string,
  body?: string | null,
  payload?: NotificationPayload,
  idempotencyKey?: string | null,
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
      return await db.notification.create({
        data: {
          ...notificationStoredCopy(data.type, data.title, data.body),
          idempotencyKey: data.idempotencyKey ?? null,
          payload: prismaPayload(data.payload),
          publicId: makePublicId("ntf"),
          projectId: data.projectId,
          type: data.type,
          userId: data.userId,
        },
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
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return null;
      }
      throw error;
    }
  };
  const notification = guardedNotificationType(data.type)
    ? await prisma.$transaction(persist)
    : await persist(prisma);

  if (!notification) {
    return null;
  }

  await publishNotificationCreated({
    createdAt: notification.createdAt.toISOString(),
    id: notification.id,
    kind: "created",
    projectId: notification.projectId,
    userId: notification.userId,
  });

  return notification;
}
