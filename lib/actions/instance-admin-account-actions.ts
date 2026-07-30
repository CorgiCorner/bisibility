"use server";

import { createHash } from "node:crypto";
import { consume, resetBucketsFor } from "@/lib/api/ratelimit";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { getInstanceAdminSession } from "@/lib/auth/instance-admin";
import { prisma } from "@/lib/db/prisma";
import { parsePublicId } from "@/lib/db/public-id";
import { z } from "zod";

const ACTION_LIMIT = 5;
const ACTION_WINDOW_SECONDS = 60;
const ACTION_RATE_LIMIT_PREFIX = "bisibility:instance-admin:account-action";

const publicUserIdSchema = z
  .string()
  .trim()
  .refine((value) => parsePublicId(value)?.prefix === "usr", "Select a valid account.");
const accountStateSchema = z
  .object({ deactivated: z.boolean(), userId: publicUserIdSchema })
  .strict();
const resetLimitsSchema = z.object({ userId: publicUserIdSchema }).strict();

type FailedResult = { message: string; status: "failed" | "forbidden" };
type LimitedResult = { message: string; retryAt: string; status: "rate_limited" };

export type SetAccountStateResult =
  | FailedResult
  | LimitedResult
  | { message: string; status: "blocked" }
  | { accountStatus: "active" | "deactivated"; message: string; status: "completed" };

export type ResetAccountLimitsResult =
  | FailedResult
  | LimitedResult
  | { clearedBuckets: number; message: string; status: "completed" };

function actorBucket(actorId: string, action: string) {
  const actorHash = createHash("sha256").update(actorId).digest("hex");
  return `${actorHash}:${action}`;
}

async function limitAction(actorId: string, action: string) {
  return consume({
    bucketKey: actorBucket(actorId, action),
    limit: ACTION_LIMIT,
    prefix: ACTION_RATE_LIMIT_PREFIX,
    windowSeconds: ACTION_WINDOW_SECONDS,
  });
}

function forbidden(): FailedResult {
  return { message: "This action is not available.", status: "forbidden" };
}

function limited(resetAt: number): LimitedResult {
  return {
    message: "This account action was rate limited. Try again shortly.",
    retryAt: new Date(resetAt).toISOString(),
    status: "rate_limited",
  };
}

async function auditRejected(actorId: string, action: string, targetId: string, reason: string) {
  await writeAudit({
    action,
    actorId,
    after: { requestedTarget: targetId },
    projectId: null,
    status: "failed",
    statusReason: reason,
    targetId: "account-action",
    targetType: "instance_ops",
  });
}

export async function setInstanceAdminAccountDeactivated(
  input: unknown,
): Promise<SetAccountStateResult> {
  const session = await getInstanceAdminSession();
  if (!session) return forbidden();

  const parsed = accountStateSchema.safeParse(input);
  if (!parsed.success) {
    return { message: "Select a valid account.", status: "failed" };
  }

  const { deactivated, userId } = parsed.data;
  const actorId = session.user.id;
  const requestedAction = deactivated ? "deactivate" : "reactivate";
  let rateLimit: Awaited<ReturnType<typeof limitAction>>;
  try {
    rateLimit = await limitAction(actorId, requestedAction);
  } catch {
    await auditRejected(
      actorId,
      `instance_admin.account_${requestedAction}_failed`,
      userId,
      "Account action rate limiter unavailable.",
    );
    return { message: "Account action is temporarily unavailable.", status: "failed" };
  }
  if (!rateLimit.success) {
    await auditRejected(
      actorId,
      `instance_admin.account_${requestedAction}_rate_limited`,
      userId,
      "Account action rate limit exceeded.",
    );
    return limited(rateLimit.resetAt);
  }

  return prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({
      select: { deactivatedAt: true, id: true, isInstanceAdmin: true, publicId: true },
      where: { publicId: userId },
    });
    if (!target) {
      await writeAudit(
        {
          action: deactivated
            ? "instance_admin.account_deactivated"
            : "instance_admin.account_reactivated",
          actorId,
          projectId: null,
          status: "failed",
          statusReason: "Account not found.",
          targetId: "account-not-found",
          targetType: "instance_ops",
        },
        tx,
      );
      return { message: "Account not found.", status: "failed" } as const;
    }

    if (deactivated && target.isInstanceAdmin) {
      const targetPublicId = requiredPublicAuditId(target.publicId, "usr", "User");
      await writeAudit(
        {
          action: "instance_admin.account_deactivate_blocked",
          actorId,
          before: { deactivatedAt: target.deactivatedAt, isInstanceAdmin: true },
          projectId: null,
          status: "failed",
          statusReason: "Instance administrators cannot be deactivated.",
          targetId: targetPublicId,
          targetType: "user",
        },
        tx,
      );
      return {
        message: "Instance administrators cannot be deactivated.",
        status: "blocked",
      } as const;
    }

    const targetPublicId = requiredPublicAuditId(target.publicId, "usr", "User");
    const changedAt = deactivated ? new Date() : null;
    await tx.user.update({ data: { deactivatedAt: changedAt }, where: { id: target.id } });
    if (deactivated) {
      await tx.session.deleteMany({ where: { userId: target.id } });
    }
    await writeAudit(
      {
        action: deactivated
          ? "instance_admin.account_deactivated"
          : "instance_admin.account_reactivated",
        actorId,
        after: { deactivatedAt: changedAt },
        before: { deactivatedAt: target.deactivatedAt },
        projectId: null,
        targetId: targetPublicId,
        targetType: "user",
      },
      tx,
    );

    return {
      accountStatus: deactivated ? "deactivated" : "active",
      message: deactivated
        ? "Account deactivated. Sessions were revoked; scheduled checks pause on reconciliation."
        : "Account reactivated. Scheduled checks will reconverge on reconciliation.",
      status: "completed",
    } as const;
  });
}

export async function resetInstanceAdminAccountLimits(
  input: unknown,
): Promise<ResetAccountLimitsResult> {
  const session = await getInstanceAdminSession();
  if (!session) return forbidden();

  const parsed = resetLimitsSchema.safeParse(input);
  if (!parsed.success) {
    return { message: "Select a valid account.", status: "failed" };
  }

  const actorId = session.user.id;
  const { userId } = parsed.data;
  let rateLimit: Awaited<ReturnType<typeof limitAction>>;
  try {
    rateLimit = await limitAction(actorId, "reset-limits");
  } catch {
    await auditRejected(
      actorId,
      "instance_admin.account_limits_reset_failed",
      userId,
      "Account action rate limiter unavailable.",
    );
    return { message: "Account action is temporarily unavailable.", status: "failed" };
  }
  if (!rateLimit.success) {
    await auditRejected(
      actorId,
      "instance_admin.account_limits_reset_rate_limited",
      userId,
      "Account action rate limit exceeded.",
    );
    return limited(rateLimit.resetAt);
  }

  try {
    const target = await prisma.user.findUnique({
      select: { id: true, publicId: true },
      where: { publicId: userId },
    });
    if (!target) {
      return { message: "Account not found.", status: "failed" };
    }
    const targetPublicId = requiredPublicAuditId(target.publicId, "usr", "User");
    const reset = await resetBucketsFor(target.id);
    const message = "Rate limits reset; monthly spend is a rolling window and cannot be reset";
    await writeAudit({
      action: "instance_admin.account_limits_reset",
      actorId,
      after: { budgetReset: false, clearedBuckets: reset.deleted },
      projectId: null,
      targetId: targetPublicId,
      targetType: "user",
    });
    return { clearedBuckets: reset.deleted, message, status: "completed" };
  } catch {
    await auditRejected(
      actorId,
      "instance_admin.account_limits_reset",
      userId,
      "Rate-limit bucket reset failed.",
    );
    return { message: "Rate limits could not be reset.", status: "failed" };
  }
}
