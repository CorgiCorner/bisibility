import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  EmailBudgetExceededError,
  EmailNotSubmittedError,
  EmailSendError,
} from "@/lib/email/types";

export type DigestKey = { userId: string; projectId: string; periodStart: Date; periodEnd: Date };

/** The unique recipient-period key arbitrates inserts; a failed row is reclaimed with CAS. */
export async function claimDigest(key: DigestKey) {
  const inserted = await prisma.weeklyDigestSend.createMany({
    data: { ...key, status: "claimed" },
    skipDuplicates: true,
  });
  if (inserted.count) return true;
  const where = { userId: key.userId, projectId: key.projectId, periodEnd: key.periodEnd };
  const reclaimed = await prisma.weeklyDigestSend.updateMany({
    where: { ...where, status: "failed" },
    data: {
      status: "claimed",
      attempts: { increment: 1 },
      lastErrorKind: null,
      updatedAt: new Date(),
    },
  });
  if (reclaimed.count) return true;
  await prisma.weeklyDigestSend.updateMany({
    where: { ...where, status: "claimed" },
    data: { status: "ambiguous", lastErrorKind: "interrupted_claim", updatedAt: new Date() },
  });
  return false;
}

export function digestErrorKind(error: unknown): "failed" | "ambiguous" {
  return error instanceof EmailNotSubmittedError ||
    error instanceof EmailBudgetExceededError ||
    (error instanceof EmailSendError && error.status >= 400 && error.status < 500)
    ? "failed"
    : "ambiguous";
}

export async function finishDigest(
  key: DigestKey,
  outcome: { status: "sent" | "skipped" } | { error: unknown },
) {
  const status = "status" in outcome ? outcome.status : digestErrorKind(outcome.error);
  await prisma.weeklyDigestSend.updateMany({
    where: { userId: key.userId, projectId: key.projectId, periodEnd: key.periodEnd },
    data: {
      status,
      updatedAt: new Date(),
      deliveredAt: status === "sent" ? new Date() : null,
      lastErrorKind:
        status === "skipped"
          ? "no_provider_local"
          : status === "sent"
            ? null
            : status === "failed"
              ? "not_submitted"
              : "handoff_unknown",
    },
  });
  return status;
}
