"use server";

import { updateProfileNameRecord } from "@/lib/account/profile-service";
import { writeAudit } from "@/lib/auth/audit";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { parsePublicId } from "@/lib/db/public-id";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const MAX_AVATAR_URL = 2048;
const MAX_NAME = 120;
const MAX_DELETE_TRANSACTION_ATTEMPTS = 3;
const LAST_INSTANCE_ADMIN_MESSAGE =
  "Transfer instance administration first - seed another admin, then delete this account.";

class LastInstanceAdminDeletionError extends Error {
  readonly code = "last_instance_admin";

  constructor() {
    super(LAST_INSTANCE_ADMIN_MESSAGE);
    this.name = "LastInstanceAdminDeletionError";
  }
}

function isTransactionConflict(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2034";
}

async function currentUserPublicId(userId: string) {
  const user = await prisma.user.findUnique({ select: { publicId: true }, where: { id: userId } });
  if (!user?.publicId) throw new Error("User public ID is not available.");
  return user.publicId;
}

// Display name shown in the sidebar account widget, user menu, and Settings profile.
const nameSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(MAX_NAME, "Name is too long."),
});

export type UpdateProfileNameInput = z.infer<typeof nameSchema>;

/**
 * Set the current user's display name (User.name). Server-side authz is implicit:
 * a session is required and only that user's row is touched.
 */
export async function updateProfileName(input: unknown): Promise<{ name: string }> {
  const data = nameSchema.parse(input);
  const session = await requireSession();
  const updated = await updateProfileNameRecord(session.user.id, data.name);

  revalidatePath("/app/account");
  return updated;
}

// Avatars are referenced by URL (no upload infra). Require https so the image is not
// blocked as mixed content, and allow an empty value to clear the avatar.
const avatarSchema = z.object({
  image: z
    .string()
    .trim()
    .max(MAX_AVATAR_URL, "Image URL is too long.")
    .refine(
      (value) => value === "" || /^https:\/\/\S+$/i.test(value),
      "Enter a valid https image URL.",
    ),
});

export type UpdateAvatarInput = z.infer<typeof avatarSchema>;

/**
 * Set or clear the current user's avatar (User.image). Server-side authz is implicit:
 * a session is required and only that user's row is touched. Empty input clears it.
 */
export async function updateAvatar(input: unknown): Promise<{ image: string | null }> {
  const data = avatarSchema.parse(input);
  const session = await requireSession();

  const before = await prisma.user.findUnique({
    select: { image: true, publicId: true },
    where: { id: session.user.id },
  });
  if (!before) {
    throw new Error("Account not found.");
  }

  const nextImage = data.image === "" ? null : data.image;
  const updated = await prisma.user.update({
    data: { image: nextImage },
    select: { image: true },
    where: { id: session.user.id },
  });

  await writeAudit({
    action: "account.avatar_updated",
    actorId: session.user.id,
    after: { image: updated.image },
    before: { image: before.image },
    targetId: before.publicId ?? (await currentUserPublicId(session.user.id)),
    targetType: "user",
  });

  revalidatePath("/app/account");
  return { image: updated.image };
}

export async function signOutEverywhere() {
  const session = await requireSession();
  const userPublicId = await currentUserPublicId(session.user.id);

  const { count } = await prisma.session.deleteMany({
    where: { id: { not: session.session.id }, userId: session.user.id },
  });

  await writeAudit({
    action: "account.sessions_revoked",
    actorId: session.user.id,
    after: { revokedCount: count },
    targetId: userPublicId,
    targetType: "user",
  });

  revalidatePath("/app/account/security");
  return { revokedCount: count };
}

const revokeSessionSchema = z.object({
  sessionId: z.string().min(1),
});

export async function revokeSession(input: unknown) {
  const data = revokeSessionSchema.parse(input);
  const session = await requireSession();

  if (parsePublicId(data.sessionId)?.prefix !== "sid") throw new Error("Session not found.");

  const target = await prisma.session.findFirst({
    select: { id: true, ipAddress: true, publicId: true, userAgent: true },
    where: { publicId: data.sessionId, userId: session.user.id },
  });
  if (!target) {
    throw new Error("Session not found.");
  }
  if (target.id === session.session.id) {
    throw new Error("You cannot revoke the current session from this row.");
  }

  await prisma.session.delete({
    where: { id: target.id },
  });

  await writeAudit({
    action: "account.session_revoked",
    actorId: session.user.id,
    before: { id: target.publicId, ipAddress: target.ipAddress, userAgent: target.userAgent },
    targetId: target.publicId ?? data.sessionId,
    targetType: "session",
  });

  revalidatePath("/app/account/security");
  return { revoked: true };
}

const deleteAccountSchema = z.object({
  email: z.email(),
});

export async function deleteAccount(input: unknown) {
  const data = deleteAccountSchema.parse(input);
  const session = await requireSession();

  if (data.email.trim().toLowerCase() !== session.user.email.trim().toLowerCase()) {
    throw new Error("Email confirmation does not match this account.");
  }

  let result: "blocked" | "deleted" | undefined;
  for (let attempt = 1; attempt <= MAX_DELETE_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      result = await prisma.$transaction(
        async (tx) => {
          // Account deletion is rare. Serializing this critical section prevents
          // two administrators from concurrently deleting the final two admins.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('instance-admin-delete'))`;

          const user = await tx.user.findUnique({
            select: {
              _count: {
                select: { accounts: true, memberships: true, projects: true, sessions: true },
              },
              email: true,
              isInstanceAdmin: true,
              name: true,
              publicId: true,
            },
            where: { id: session.user.id },
          });
          if (!user) {
            throw new Error("Account not found.");
          }
          if (!user.publicId) {
            throw new Error("User public ID is not available.");
          }

          if (user.isInstanceAdmin) {
            const adminCount = await tx.user.count({ where: { isInstanceAdmin: true } });
            if (adminCount <= 1) {
              await writeAudit(
                {
                  action: "instance_admin.delete_blocked",
                  actorId: session.user.id,
                  before: { isInstanceAdmin: true },
                  status: "failed",
                  statusReason: LAST_INSTANCE_ADMIN_MESSAGE,
                  targetId: user.publicId,
                  targetType: "user",
                },
                tx,
              );
              return "blocked" as const;
            }
          }

          await writeAudit(
            {
              action: "account.deleted",
              actorId: session.user.id,
              before: { counts: user._count, email: user.email, name: user.name },
              targetId: user.publicId,
              targetType: "user",
            },
            tx,
          );

          await tx.user.delete({ where: { id: session.user.id } });
          return "deleted" as const;
        },
        { isolationLevel: "Serializable" },
      );
      break;
    } catch (error) {
      if (!isTransactionConflict(error) || attempt === MAX_DELETE_TRANSACTION_ATTEMPTS) {
        throw error;
      }
    }
  }

  if (result === "blocked") {
    throw new LastInstanceAdminDeletionError();
  }
  if (result !== "deleted") {
    throw new Error("Account could not be deleted.");
  }

  redirect("/login");
}
