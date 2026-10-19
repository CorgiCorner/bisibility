import "server-only";

import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id-resources";
import type { DevicePushToken } from "@/lib/generated/prisma/client";
import type { PushEnvironment } from "./apns";

export type RegisterPushTokenInput = {
  bundleId: string;
  environment: PushEnvironment;
  token: string;
};

/** APNs device tokens are hex; store them lowercase so one device maps to one row. */
export function normalizePushToken(token: string): string {
  return token.trim().toLowerCase();
}

/**
 * Idempotent registration. A token belongs to exactly one user: registering
 * it from another account moves it there (the device switched accounts), with
 * a new public id so the previous owner's id is never reused.
 */
export async function registerPushToken(
  userId: string,
  input: RegisterPushTokenInput,
  now = new Date(),
): Promise<DevicePushToken> {
  const token = normalizePushToken(input.token);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.devicePushToken.findUnique({ where: { token } });
    if (!existing) {
      await tx.devicePushToken.createMany({
        data: [
          {
            bundleId: input.bundleId,
            environment: input.environment,
            lastSeenAt: now,
            publicId: makePublicId("dpt"),
            token,
            userId,
          },
        ],
        skipDuplicates: true,
      });
      const created = await tx.devicePushToken.findUniqueOrThrow({ where: { token } });
      if (created.userId === userId) return created;
      return moveToken(tx, created.id, userId, input, now);
    }
    if (existing.userId !== userId) return moveToken(tx, existing.id, userId, input, now);
    return tx.devicePushToken.update({
      data: {
        bundleId: input.bundleId,
        environment: input.environment,
        lastSeenAt: now,
        revokedAt: null,
      },
      where: { id: existing.id },
    });
  });
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

function moveToken(tx: Tx, id: string, userId: string, input: RegisterPushTokenInput, now: Date) {
  return tx.devicePushToken.update({
    data: {
      bundleId: input.bundleId,
      environment: input.environment,
      lastSeenAt: now,
      publicId: makePublicId("dpt"),
      revokedAt: null,
      userId,
    },
    where: { id },
  });
}

export function listPushTokens(userId: string) {
  return prisma.devicePushToken.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    where: { revokedAt: null, userId },
  });
}

/** Deletes the caller's own token; returns null when it is not theirs. */
export async function deletePushToken(
  userId: string,
  publicId: string,
): Promise<DevicePushToken | null> {
  const row = await prisma.devicePushToken.findFirst({ where: { publicId, userId } });
  if (!row) return null;
  const deleted = await prisma.devicePushToken.deleteMany({
    where: { id: row.id, publicId, userId },
  });
  return deleted.count === 1 ? row : null;
}

/** The push service reported the token unregistered or invalid. */
export async function deleteInvalidPushToken(token: string): Promise<void> {
  await prisma.devicePushToken.deleteMany({ where: { token } });
}

export type PushRecipientToken = {
  environment: PushEnvironment;
  token: string;
  userId: string;
};

/**
 * Active tokens for the project's owner and members who keep alertPush on
 * (the default), limited to the app bundle the sender is configured for.
 */
export async function projectPushRecipients(
  projectId: string,
  topic: string,
): Promise<PushRecipientToken[]> {
  const project = await prisma.project.findUnique({
    select: { members: { select: { userId: true } }, ownerId: true },
    where: { id: projectId },
  });
  if (!project) return [];
  const members = [
    ...new Set([project.ownerId, ...project.members.map((member) => member.userId)]),
  ];
  const optedOut = await prisma.notificationPreference.findMany({
    select: { userId: true },
    where: { alertPush: false, projectId, userId: { in: members } },
  });
  const blocked = new Set(optedOut.map((row) => row.userId));
  const tokens = await prisma.devicePushToken.findMany({
    select: { environment: true, token: true, userId: true },
    where: {
      bundleId: topic,
      revokedAt: null,
      userId: { in: members.filter((userId) => !blocked.has(userId)) },
    },
  });
  return tokens.map((row) => ({
    environment: row.environment === "sandbox" ? "sandbox" : "production",
    token: row.token,
    userId: row.userId,
  }));
}
