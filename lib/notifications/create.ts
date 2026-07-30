import "server-only";

import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import { NotificationType, Prisma } from "@/lib/generated/prisma/client";
import { z } from "zod";
import type { NotificationPayload } from "./format";
import { publishNotificationCreated } from "./realtime";

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

const IN_APP_DEFAULTS = {
  alertInApp: true,
  checkInApp: false,
  importInApp: true,
  inviteInApp: true,
} as const;

function prismaPayload(value: NotificationPayload | undefined) {
  if (value === undefined) {
    return undefined;
  }

  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

function inAppPreference(type: NotificationType) {
  if (type === NotificationType.alert_fired) {
    return "alertInApp";
  }
  if (type === NotificationType.check_complete || type === NotificationType.check_failed) {
    return "checkInApp";
  }
  if (type === NotificationType.invite || type === NotificationType.member_joined) {
    return "inviteInApp";
  }
  if (type === NotificationType.import_done || type === NotificationType.import_failed) {
    return "importInApp";
  }
  return null;
}

async function shouldCreateInAppNotification(
  userId: string,
  projectId: string | null,
  type: NotificationType,
) {
  const field = inAppPreference(type);
  if (!field || !projectId) {
    return true;
  }

  const preference = await prisma.notificationPreference.findUnique({
    select: {
      alertInApp: true,
      checkInApp: true,
      importInApp: true,
      inviteInApp: true,
    },
    where: { userId_projectId: { projectId, userId } },
  });

  return preference?.[field] ?? IN_APP_DEFAULTS[field];
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

  if (!(await shouldCreateInAppNotification(data.userId, data.projectId, data.type))) {
    return null;
  }

  const notification = await (async () => {
    try {
      return await prisma.notification.create({
        data: {
          body: data.body || null,
          idempotencyKey: data.idempotencyKey ?? null,
          payload: prismaPayload(data.payload),
          publicId: makePublicId("ntf"),
          projectId: data.projectId,
          title: data.title,
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
  })();

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
