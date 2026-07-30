import "server-only";

import { randomUUID } from "node:crypto";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { TwoFactorManagementError } from "./two-factor-management-error";
import type { CompleteTwoFactorEnrollmentInput } from "./two-factor-management-schema";
import {
  decryptTwoFactorValue,
  encryptBackupCodes,
  encryptTwoFactorValue,
  generateTwoFactorBackupCodes,
  generateTwoFactorSecret,
  twoFactorTotp,
} from "./two-factor-material";
import {
  consumeEnrollmentAttempt,
  consumeTwoFactorGrant,
  type TwoFactorOperation,
  type TwoFactorSecurityContext,
} from "./two-factor-step-up";

const ENROLLMENT_PREFIX = "two-factor-enrollment:";
const ENROLLMENT_SECONDS = 10 * 60;
const TRUST_DEVICE_PREFIX = "trust-device-";
const VERIFIED_FACTOR_FILTER = { OR: [{ verified: true }, { verified: null }] };

type PendingEnrollment = {
  mode: "enroll" | "replace";
  secret: string;
};

function enrollmentIdentifier(actorId: string, enrollmentId: string) {
  return `${ENROLLMENT_PREFIX}${actorId}:${enrollmentId}`;
}

function pendingEnrollment(value: unknown): PendingEnrollment | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PendingEnrollment>;
  if ((candidate.mode !== "enroll" && candidate.mode !== "replace") || !candidate.secret) {
    return null;
  }
  return { mode: candidate.mode, secret: candidate.secret };
}

function unavailable(message = "Two-factor authentication is temporarily unavailable.") {
  return new TwoFactorManagementError("unavailable", message);
}

export async function beginTwoFactorEnrollment(context: TwoFactorSecurityContext, grantId: string) {
  const mode: PendingEnrollment["mode"] = context.twoFactorEnabled ? "replace" : "enroll";
  const secret = generateTwoFactorSecret();
  const enrollmentId = randomUUID();
  const encrypted = await encryptTwoFactorValue(JSON.stringify({ mode, secret }));
  const identifier = enrollmentIdentifier(context.actorId, enrollmentId);
  const expiresAt = new Date(Date.now() + ENROLLMENT_SECONDS * 1000);

  await prisma.$transaction(async (transaction) => {
    await consumeTwoFactorGrant(transaction, context, mode, grantId);
    await transaction.verification.deleteMany({
      where: { identifier: { startsWith: `${ENROLLMENT_PREFIX}${context.actorId}:` } },
    });
    await transaction.verification.create({
      data: { expiresAt, identifier, value: encrypted },
    });
    await writeAudit(
      {
        action:
          mode === "replace"
            ? "account.two_factor_replacement_started"
            : "account.two_factor_enrollment_started",
        actorId: context.actorId,
        after: { expiresAt, mode },
        targetId: context.actorPublicId,
        targetType: "user",
      },
      transaction,
    );
  });

  return {
    enrollmentId,
    expiresAt: expiresAt.toISOString(),
    secret,
    totpURI: twoFactorTotp(secret).url("Bisibility", context.email),
  };
}

async function readPendingEnrollment(
  context: TwoFactorSecurityContext,
  input: CompleteTwoFactorEnrollmentInput,
) {
  const record = await prisma.verification.findFirst({
    where: {
      expiresAt: { gt: new Date() },
      identifier: enrollmentIdentifier(context.actorId, input.enrollmentId),
    },
  });
  if (!record) {
    throw new TwoFactorManagementError(
      "enrollment_expired",
      "The enrollment expired. Start again.",
    );
  }

  try {
    const value = pendingEnrollment(JSON.parse(await decryptTwoFactorValue(record.value)));
    if (!value) throw unavailable();
    return { record, value };
  } catch (error) {
    if (error instanceof TwoFactorManagementError) throw error;
    throw unavailable();
  }
}

async function auditEnrollmentFailure(
  context: TwoFactorSecurityContext,
  mode: PendingEnrollment["mode"],
) {
  await writeAudit({
    action: "account.two_factor_enrollment_verification_failed",
    actorId: context.actorId,
    after: { mode },
    status: "failed",
    statusReason: "New authenticator verification failed.",
    targetId: context.actorPublicId,
    targetType: "user",
  });
}

export async function completeTwoFactorEnrollment(
  context: TwoFactorSecurityContext,
  input: CompleteTwoFactorEnrollmentInput,
) {
  await consumeEnrollmentAttempt(context);
  const pending = await readPendingEnrollment(context, input);
  if (
    (pending.value.mode === "replace" && !context.twoFactorEnabled) ||
    (pending.value.mode === "enroll" && context.twoFactorEnabled)
  ) {
    throw new TwoFactorManagementError("enrollment_expired", "Account state changed. Start again.");
  }
  if (!(await twoFactorTotp(pending.value.secret).verify(input.code))) {
    await auditEnrollmentFailure(context, pending.value.mode);
    throw new TwoFactorManagementError("step_up_failed", "The authenticator code is not valid.");
  }

  const backupCodes = generateTwoFactorBackupCodes();
  const [encryptedSecret, encryptedBackupCodes] = await Promise.all([
    encryptTwoFactorValue(pending.value.secret),
    encryptBackupCodes(backupCodes),
  ]);

  await prisma.$transaction(async (transaction) => {
    const consumed = await transaction.verification.deleteMany({
      where: {
        expiresAt: { gt: new Date() },
        id: pending.record.id,
        identifier: pending.record.identifier,
        value: pending.record.value,
      },
    });
    if (consumed.count !== 1) throw unavailable();

    const existing = await transaction.twoFactor.findFirst({
      select: { id: true },
      where: { userId: context.actorId },
    });
    const data = {
      backupCodes: encryptedBackupCodes,
      failedVerificationCount: 0,
      lockedUntil: null,
      secret: encryptedSecret,
      verified: true,
    };
    if (existing) {
      await transaction.twoFactor.update({ data, where: { id: existing.id } });
      await transaction.twoFactor.deleteMany({
        where: { id: { not: existing.id }, userId: context.actorId },
      });
    } else {
      await transaction.twoFactor.create({ data: { ...data, userId: context.actorId } });
    }
    const updatedUser = await transaction.user.updateMany({
      data: { twoFactorEnabled: true },
      where: {
        id: context.actorId,
        twoFactorEnabled: context.twoFactorEnabled,
      },
    });
    if (updatedUser.count !== 1) throw unavailable("Account state changed. Start again.");
    await transaction.verification.deleteMany({
      where: { identifier: { startsWith: TRUST_DEVICE_PREFIX }, value: context.actorId },
    });
    await writeAudit(
      {
        action:
          pending.value.mode === "replace"
            ? "account.two_factor_replaced"
            : "account.two_factor_enabled",
        actorId: context.actorId,
        after: { enabled: true },
        before: { enabled: context.twoFactorEnabled },
        targetId: context.actorPublicId,
        targetType: "user",
      },
      transaction,
    );
  });

  return { backupCodes, replaced: pending.value.mode === "replace" };
}

export async function regenerateTwoFactorBackupCodes(
  context: TwoFactorSecurityContext,
  grantId: string,
) {
  const backupCodes = generateTwoFactorBackupCodes();
  const encrypted = await encryptBackupCodes(backupCodes);

  await prisma.$transaction(async (transaction) => {
    await consumeTwoFactorGrant(transaction, context, "regenerate", grantId);
    const updated = await transaction.twoFactor.updateMany({
      data: { backupCodes: encrypted },
      where: { ...VERIFIED_FACTOR_FILTER, userId: context.actorId },
    });
    if (updated.count !== 1) throw unavailable();
    await writeAudit(
      {
        action: "account.two_factor_backup_codes_regenerated",
        actorId: context.actorId,
        after: { regenerated: true },
        targetId: context.actorPublicId,
        targetType: "user",
      },
      transaction,
    );
  });

  return { backupCodes };
}

export async function disableTwoFactor(context: TwoFactorSecurityContext, grantId: string) {
  await prisma.$transaction(async (transaction) => {
    await consumeTwoFactorGrant(transaction, context, "disable", grantId);
    const removed = await transaction.twoFactor.deleteMany({
      where: { userId: context.actorId },
    });
    if (removed.count < 1) throw unavailable();
    await transaction.user.update({
      data: { twoFactorEnabled: false },
      where: { id: context.actorId },
    });
    await transaction.verification.deleteMany({
      where: {
        OR: [
          { identifier: { startsWith: TRUST_DEVICE_PREFIX }, value: context.actorId },
          { identifier: { startsWith: `${ENROLLMENT_PREFIX}${context.actorId}:` } },
        ],
      },
    });
    await writeAudit(
      {
        action: "account.two_factor_disabled",
        actorId: context.actorId,
        after: { enabled: false, sessionsRevoked: true },
        before: { enabled: true },
        targetId: context.actorPublicId,
        targetType: "user",
      },
      transaction,
    );
    await transaction.session.deleteMany({ where: { userId: context.actorId } });
  });

  return { signedOut: true };
}

export function enrollmentOperation(context: TwoFactorSecurityContext): TwoFactorOperation {
  return context.twoFactorEnabled ? "replace" : "enroll";
}
