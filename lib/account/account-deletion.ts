import "server-only";

import {
  flushAnalyticsPersonDeletions,
  queueAnalyticsPersonDeletion,
} from "@/lib/analytics/person-deletion";
import {
  APPLE_PROVIDER_ID,
  type AppleRevocationResult,
  revokeAppleTokens,
} from "@/lib/auth/apple-token-revocation";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { assertEditableDemoIdentityPreserved } from "@/lib/demo/identity";
import { onAccountDeletion } from "./account-deletion-extension";

const MAX_DELETE_TRANSACTION_ATTEMPTS = 3;
const DELETE_TRANSACTION_TIMEOUT_MS = 30_000;
export const LAST_INSTANCE_ADMIN_MESSAGE =
  "Transfer instance administration first - seed another admin, then delete this account.";

export class LastInstanceAdminDeletionError extends Error {
  readonly code = "last_instance_admin";

  constructor() {
    super(LAST_INSTANCE_ADMIN_MESSAGE);
    this.name = "LastInstanceAdminDeletionError";
  }
}

export class AccountDeletionConfirmationError extends Error {
  readonly code = "confirmation_mismatch";

  constructor() {
    super("Email confirmation does not match this account.");
    this.name = "AccountDeletionConfirmationError";
  }
}

function isTransactionConflict(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2034";
}

function sameEmail(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/** Revocation is best effort: a failure is audited and never blocks deletion. */
async function revokeExternalSignIns(userId: string, publicId: string) {
  const accounts = await prisma.account.findMany({
    select: { accessToken: true, refreshToken: true },
    where: { providerId: APPLE_PROVIDER_ID, userId },
  });
  let result: AppleRevocationResult;
  try {
    result = await revokeAppleTokens(accounts);
  } catch {
    result = { attempted: accounts.length, revoked: 0, skipped: "none" };
  }
  if (result.attempted > 0) {
    await writeAudit({
      action: "account.apple_tokens_revoked",
      actorId: userId,
      after: { attempted: result.attempted, revoked: result.revoked, skipped: result.skipped },
      status: result.revoked === result.attempted ? "success" : "failed",
      statusReason:
        result.revoked === result.attempted ? undefined : "Apple token revocation incomplete.",
      targetId: publicId,
      targetType: "user",
    });
  }
}

/**
 * Deletes the account and everything that cascades from it: owned projects
 * with their keywords and history, memberships, sessions, linked sign-in
 * accounts, personal access tokens and OAuth grants. Financial and audit
 * records keep scalar owner ids and are retained (see DATA-RETENTION).
 */
export async function deleteAccountRecords(input: {
  confirmEmail: string;
  source: "api" | "web";
  userId: string;
}): Promise<void> {
  await assertEditableDemoIdentityPreserved(input.userId);
  const current = await prisma.user.findUnique({
    select: { email: true, publicId: true },
    where: { id: input.userId },
  });
  if (!current?.publicId) throw new Error("Account not found.");
  if (!sameEmail(input.confirmEmail, current.email)) throw new AccountDeletionConfirmationError();
  await revokeExternalSignIns(input.userId, current.publicId);

  let result: "blocked" | "deleted" | undefined;
  for (let attempt = 1; attempt <= MAX_DELETE_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      result = await prisma.$transaction(
        (tx) => deleteInTransaction(tx, input.userId, input.source),
        { isolationLevel: "Serializable", timeout: DELETE_TRANSACTION_TIMEOUT_MS },
      );
      break;
    } catch (error) {
      if (!isTransactionConflict(error) || attempt === MAX_DELETE_TRANSACTION_ATTEMPTS) {
        throw error;
      }
    }
  }
  if (result === "blocked") throw new LastInstanceAdminDeletionError();
  if (result !== "deleted") throw new Error("Account could not be deleted.");
  await flushAnalyticsPersonDeletions();
}

type DeletionTransaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function deleteInTransaction(
  tx: DeletionTransaction,
  userId: string,
  source: "api" | "web",
): Promise<"blocked" | "deleted"> {
  // Account deletion is rare. Serializing this critical section prevents
  // two administrators from concurrently deleting the final two admins.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('instance-admin-delete'))`;
  const user = await tx.user.findUnique({
    select: {
      _count: {
        select: {
          accounts: true,
          memberships: true,
          projects: true,
          sessions: true,
        },
      },
      email: true,
      isInstanceAdmin: true,
      name: true,
      publicId: true,
    },
    where: { id: userId },
  });
  if (!user) throw new Error("Account not found.");
  if (!user.publicId) throw new Error("User public ID is not available.");
  if (user.isInstanceAdmin) {
    const adminCount = await tx.user.count({ where: { isInstanceAdmin: true } });
    if (adminCount <= 1) {
      await writeAudit(
        {
          action: "instance_admin.delete_blocked",
          actorId: userId,
          before: { isInstanceAdmin: true },
          status: "failed",
          statusReason: LAST_INSTANCE_ADMIN_MESSAGE,
          targetId: user.publicId,
          targetType: "user",
        },
        tx,
      );
      return "blocked";
    }
  }
  await writeAudit(
    {
      action: "account.deleted",
      actorId: userId,
      after: { source },
      before: { counts: user._count, email: user.email, name: user.name },
      targetId: user.publicId,
      targetType: "user",
    },
    tx,
  );
  await onAccountDeletion(tx, userId, new Date());
  await queueAnalyticsPersonDeletion(tx, { id: userId, publicId: user.publicId });
  await tx.user.delete({ where: { id: userId } });
  return "deleted";
}
