import "server-only";

import type { Prisma } from "@/lib/generated/prisma/client";
import {
  TWO_FACTOR_STEP_UP_ATTEMPT_LIMIT,
  TWO_FACTOR_STEP_UP_LOCK_SECONDS,
} from "./two-factor-policy";

const VERIFIED_FACTOR_FILTER = { OR: [{ verified: true }, { verified: null }] };

export async function claimFactorAttempt(transaction: Prisma.TransactionClient, actorId: string) {
  const candidate = await transaction.twoFactor.findFirst({
    select: { id: true },
    where: { ...VERIFIED_FACTOR_FILTER, userId: actorId },
  });
  if (!candidate) {
    return {
      auditReason: "Current factor is unavailable.",
      status: "invalid" as const,
    };
  }

  const now = new Date();
  await transaction.twoFactor.updateMany({
    data: { failedVerificationCount: 0 },
    where: { failedVerificationCount: null, id: candidate.id },
  });
  await transaction.twoFactor.updateMany({
    data: { failedVerificationCount: 0, lockedUntil: null },
    where: { id: candidate.id, lockedUntil: { lte: now } },
  });
  const [factor] = await transaction.twoFactor.updateManyAndReturn({
    data: {
      failedVerificationCount: { increment: 1 },
      lockedUntil: null,
    },
    select: {
      backupCodes: true,
      failedVerificationCount: true,
      id: true,
      secret: true,
    },
    where: {
      AND: [
        { OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] },
        {
          OR: [
            { failedVerificationCount: null },
            { failedVerificationCount: { lt: TWO_FACTOR_STEP_UP_ATTEMPT_LIMIT } },
          ],
        },
      ],
      id: candidate.id,
    },
  });
  if (factor) return { factor, status: "claimed" as const };

  const current = await transaction.twoFactor.findUnique({
    select: { lockedUntil: true },
    where: { id: candidate.id },
  });
  if (!current) {
    return {
      auditReason: "Current factor is unavailable.",
      status: "invalid" as const,
    };
  }
  const alreadyLocked = Boolean(
    current.lockedUntil && current.lockedUntil.getTime() > now.getTime(),
  );
  const lockedUntil = alreadyLocked
    ? current.lockedUntil
    : new Date(now.getTime() + TWO_FACTOR_STEP_UP_LOCK_SECONDS * 1000);
  if (!lockedUntil) {
    return {
      auditReason: "Current factor is unavailable.",
      status: "invalid" as const,
    };
  }
  if (!alreadyLocked) {
    await transaction.twoFactor.update({
      data: { lockedUntil },
      where: { id: candidate.id },
    });
  }
  return {
    auditReason: "Current factor is locked.",
    retryAt: lockedUntil.getTime(),
    status: "locked" as const,
  };
}

export async function recordInvalidFactor(
  transaction: Prisma.TransactionClient,
  factor: { failedVerificationCount: number | null; id: string },
) {
  const lockedUntil =
    (factor.failedVerificationCount ?? 0) >= TWO_FACTOR_STEP_UP_ATTEMPT_LIMIT
      ? new Date(Date.now() + TWO_FACTOR_STEP_UP_LOCK_SECONDS * 1000)
      : null;
  if (lockedUntil) {
    await transaction.twoFactor.update({
      data: { lockedUntil },
      where: { id: factor.id },
    });
  }
  return lockedUntil;
}
