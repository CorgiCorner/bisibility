import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { consume } from "@/lib/api/ratelimit";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { verifyPassword } from "better-auth/crypto";
import { claimFactorAttempt, recordInvalidFactor } from "./two-factor-attempt-budget";
import {
  TwoFactorManagementError,
  type TwoFactorManagementErrorCode,
} from "./two-factor-management-error";
import type { TwoFactorManagementInput, TwoFactorMethod } from "./two-factor-management-schema";
import {
  decryptBackupCodes,
  decryptTwoFactorValue,
  encryptBackupCodes,
  findBackupCode,
  twoFactorTotp,
} from "./two-factor-material";
import {
  TWO_FACTOR_FRESH_SESSION_SECONDS,
  TWO_FACTOR_STEP_UP_ATTEMPT_LIMIT,
  TWO_FACTOR_STEP_UP_GRANT_SECONDS,
  TWO_FACTOR_STEP_UP_WINDOW_SECONDS,
} from "./two-factor-policy";

export type TwoFactorOperation = "disable" | "enroll" | "regenerate" | "replace";

export type TwoFactorSecurityContext = {
  actorId: string;
  actorPublicId: string;
  credentialPasswordHash: string | null;
  email: string;
  sessionCreatedAt: Date;
  sessionId: string;
  twoFactorEnabled: boolean;
};

const RATE_LIMIT_PREFIX = "bisibility:two-factor:management";
const GRANT_PREFIX = "two-factor-step-up:";

class FactorStateConflictError extends Error {}

function actorBucket(actorId: string) {
  return createHash("sha256").update(actorId).digest("hex");
}

function stepUpFailure(code: TwoFactorManagementErrorCode, retryAt?: number) {
  const messages: Record<TwoFactorManagementErrorCode, string> = {
    enrollment_expired: "The enrollment expired. Start again.",
    invalid_input: "Check the form and try again.",
    rate_limited: "Too many verification attempts. Try again later.",
    session_not_fresh: "Sign out and sign in again before enabling two-factor authentication.",
    step_up_failed: "Verification failed. Check the current factor and password.",
    step_up_locked: "Two-factor verification is temporarily locked. Try again later.",
    unavailable: "Two-factor authentication is temporarily unavailable.",
  };
  return new TwoFactorManagementError(code, messages[code], retryAt);
}

async function auditRejected(
  context: TwoFactorSecurityContext,
  operation: TwoFactorOperation,
  reason: string,
  client?: Prisma.TransactionClient,
) {
  await writeAudit(
    {
      action: "account.two_factor_step_up_failed",
      actorId: context.actorId,
      after: { operation },
      status: "failed",
      statusReason: reason,
      targetId: context.actorPublicId,
      targetType: "user",
    },
    client,
  );
}

async function auditRejectedBestEffort(
  context: TwoFactorSecurityContext,
  operation: TwoFactorOperation,
  reason: string,
) {
  try {
    await auditRejected(context, operation, reason);
  } catch (error) {
    console.error("[two-factor] Failed to audit a rejected management step-up.", error);
  }
}

async function limitAttempt(context: TwoFactorSecurityContext, operation: TwoFactorOperation) {
  let limit: Awaited<ReturnType<typeof consume>>;
  try {
    limit = await consume({
      bucketKey: actorBucket(context.actorId),
      limit: TWO_FACTOR_STEP_UP_ATTEMPT_LIMIT,
      prefix: RATE_LIMIT_PREFIX,
      windowSeconds: TWO_FACTOR_STEP_UP_WINDOW_SECONDS,
    });
  } catch {
    await auditRejectedBestEffort(context, operation, "Rate limiter unavailable.");
    throw stepUpFailure("unavailable");
  }
  if (!limit.success) {
    await auditRejectedBestEffort(context, operation, "Rate limit exceeded.");
    throw stepUpFailure("rate_limited", limit.resetAt);
  }
}

async function verifyCredentialPassword(
  context: TwoFactorSecurityContext,
  operation: TwoFactorOperation,
  password: string,
) {
  if (!context.credentialPasswordHash) return;
  if (password && (await verifyPassword({ hash: context.credentialPasswordHash, password }))) {
    return;
  }
  await auditRejectedBestEffort(context, operation, "Credential verification failed.");
  throw stepUpFailure("step_up_failed");
}

function grantValue(context: TwoFactorSecurityContext, operation: TwoFactorOperation) {
  return `${context.actorId}:${context.sessionId}:${operation}`;
}

async function createGrant(
  transaction: Prisma.TransactionClient,
  context: TwoFactorSecurityContext,
  operation: TwoFactorOperation,
) {
  const id = randomUUID();
  await transaction.verification.create({
    data: {
      expiresAt: new Date(Date.now() + TWO_FACTOR_STEP_UP_GRANT_SECONDS * 1000),
      identifier: `${GRANT_PREFIX}${id}`,
      value: grantValue(context, operation),
    },
  });
  return id;
}

async function verifyCurrentFactorAndGrant(
  context: TwoFactorSecurityContext,
  operation: TwoFactorOperation,
  method: TwoFactorMethod,
  code: string,
) {
  const result = await (async () => {
    try {
      return await prisma.$transaction(async (transaction) => {
        const claim = await claimFactorAttempt(transaction, context.actorId);
        if (claim.status !== "claimed") return claim;
        const { factor } = claim;

        let valid = false;
        let nextBackupCodes: string[] | null = null;
        if (method === "totp") {
          const secret = await decryptTwoFactorValue(factor.secret);
          valid = await twoFactorTotp(secret).verify(code);
        } else {
          const codes = await decryptBackupCodes(factor.backupCodes);
          const index = findBackupCode(codes, code);
          valid = index >= 0;
          if (valid && operation !== "replace") {
            nextBackupCodes = codes.filter((_, itemIndex) => itemIndex !== index);
          }
        }

        if (!valid) {
          const lockedUntil = await recordInvalidFactor(transaction, factor);
          return lockedUntil
            ? {
                auditReason: "Current factor verification failed.",
                retryAt: lockedUntil.getTime(),
                status: "locked" as const,
              }
            : {
                auditReason: "Current factor verification failed.",
                status: "invalid" as const,
              };
        }

        const encryptedBackupCodes = nextBackupCodes
          ? await encryptBackupCodes(nextBackupCodes)
          : undefined;
        const updated = await transaction.twoFactor.updateMany({
          data: {
            failedVerificationCount: 0,
            lockedUntil: null,
            ...(encryptedBackupCodes ? { backupCodes: encryptedBackupCodes } : {}),
          },
          where: {
            id: factor.id,
            ...(nextBackupCodes ? { backupCodes: factor.backupCodes } : {}),
          },
        });
        if (updated.count !== 1) {
          throw new FactorStateConflictError("The current factor changed during verification.");
        }
        return {
          grantId: await createGrant(transaction, context, operation),
          status: "valid" as const,
        };
      });
    } catch (error) {
      if (error instanceof FactorStateConflictError) {
        await auditRejectedBestEffort(
          context,
          operation,
          "Current factor changed during verification.",
        );
        throw stepUpFailure("unavailable");
      }
      throw error;
    }
  })();

  if (result.status === "valid") return result.grantId;
  await auditRejectedBestEffort(context, operation, result.auditReason);
  if (result.status === "locked") throw stepUpFailure("step_up_locked", result.retryAt);
  if (result.status === "invalid") throw stepUpFailure("step_up_failed");
  throw stepUpFailure("unavailable");
}

export async function authorizeTwoFactorOperation(
  context: TwoFactorSecurityContext,
  operation: TwoFactorOperation,
  input: TwoFactorManagementInput,
) {
  await limitAttempt(context, operation);
  await verifyCredentialPassword(context, operation, input.password);

  if (context.twoFactorEnabled) {
    return verifyCurrentFactorAndGrant(context, operation, input.method, input.code);
  }

  const ageSeconds = (Date.now() - context.sessionCreatedAt.getTime()) / 1000;
  if (ageSeconds >= TWO_FACTOR_FRESH_SESSION_SECONDS) {
    await auditRejectedBestEffort(context, operation, "Session is not fresh.");
    throw stepUpFailure("session_not_fresh");
  }

  return prisma.$transaction((transaction) => createGrant(transaction, context, operation));
}

export async function consumeTwoFactorGrant(
  transaction: Prisma.TransactionClient,
  context: TwoFactorSecurityContext,
  operation: TwoFactorOperation,
  grantId: string,
) {
  const consumed = await transaction.verification.deleteMany({
    where: {
      expiresAt: { gt: new Date() },
      identifier: `${GRANT_PREFIX}${grantId}`,
      value: grantValue(context, operation),
    },
  });
  if (consumed.count !== 1) throw stepUpFailure("step_up_failed");
}

export async function consumeEnrollmentAttempt(context: TwoFactorSecurityContext) {
  await limitAttempt(context, context.twoFactorEnabled ? "replace" : "enroll");
}
