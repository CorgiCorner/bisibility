"use server";

import { consume } from "@/lib/api/ratelimit";
import { writeAudit } from "@/lib/auth/audit";
import { getInstanceAdminSession } from "@/lib/auth/instance-admin";
import { getOpsConfig } from "@/lib/ops/config";
import { redactOpsText } from "@/lib/ops/slack";
import { sweepUndeliveredOpsEvents } from "@/lib/ops/sweep";
import { sendOpsTestNotification } from "@/lib/ops/test-notification";

const ADMIN_ACTION_LIMIT = 3;
const ADMIN_ACTION_WINDOW_SECONDS = 60;
const RATE_LIMIT_PREFIX = "bisibility:instance-admin:ops-action";

type LimitedResult = {
  message: string;
  retryAt: string;
  status: "rate_limited";
};

type FailedResult = { message: string; status: "failed" };
type ForbiddenResult = { message: string; status: "forbidden" };

export type SendTestSlackResult =
  | FailedResult
  | ForbiddenResult
  | LimitedResult
  | { message: string; status: "delivered" | "not_configured" }
  | { message: string; status: "delivery_failed" };

export type RunOpsSweepResult =
  | FailedResult
  | ForbiddenResult
  | LimitedResult
  | {
      attempted: number;
      delivered: number;
      message: string;
      status: "completed";
    }
  | { message: string; status: "not_configured" };

type AdminOpsAction = "send-test-slack" | "sweep-outbox";

async function consumeAdminAction(actorId: string, action: AdminOpsAction) {
  try {
    return await consume({
      bucketKey: `${actorId}:${action}`,
      limit: ADMIN_ACTION_LIMIT,
      prefix: RATE_LIMIT_PREFIX,
      windowSeconds: ADMIN_ACTION_WINDOW_SECONDS,
    });
  } catch (error) {
    console.error(`[ops] admin action limiter failed: ${redactOpsText(error)}`);
    return null;
  }
}

function limitedResult(resetAt: number): LimitedResult {
  return {
    message: "This admin action was rate limited. Try again shortly.",
    retryAt: new Date(resetAt).toISOString(),
    status: "rate_limited",
  };
}

function forbiddenResult(): ForbiddenResult {
  return { message: "This action is not available.", status: "forbidden" };
}

async function auditRateLimit(actorId: string, action: string, targetId: string) {
  await writeAudit({
    action,
    actorId,
    after: { result: "rate_limited" },
    status: "failed",
    statusReason: "Instance admin action rate limit exceeded.",
    targetId,
    targetType: "instance_ops",
  });
}

async function auditUnavailable(actorId: string, action: string, targetId: string) {
  await writeAudit({
    action,
    actorId,
    after: { result: "failed" },
    status: "failed",
    statusReason: "Instance admin action rate limiter unavailable.",
    targetId,
    targetType: "instance_ops",
  });
}

export async function sendTestSlackNotification(): Promise<SendTestSlackResult> {
  const session = await getInstanceAdminSession();
  if (!session) return forbiddenResult();

  const actorId = session.user.id;
  const config = getOpsConfig();
  if (!config.enabled) {
    await writeAudit({
      action: "instance_admin.ops_test.send",
      actorId,
      after: { result: "not_configured" },
      status: "failed",
      statusReason: "Operator Slack notifications are not configured.",
      targetId: "ops-slack",
      targetType: "instance_ops",
    });
    return {
      message: "Slack operator notifications are not configured.",
      status: "not_configured",
    };
  }

  const rateLimit = await consumeAdminAction(actorId, "send-test-slack");
  if (!rateLimit) {
    await auditUnavailable(actorId, "instance_admin.ops_test.failed", "ops-slack");
    return { message: "Admin action is temporarily unavailable.", status: "failed" };
  }
  if (!rateLimit.success) {
    await auditRateLimit(actorId, "instance_admin.ops_test.rate_limited", "ops-slack");
    return limitedResult(rateLimit.resetAt);
  }

  const result = await sendOpsTestNotification(config);
  if (result.status === "delivered") {
    await writeAudit({
      action: "instance_admin.ops_test.send",
      actorId,
      after: { result: "delivered" },
      targetId: "ops-slack",
      targetType: "instance_ops",
    });
    return { message: "Test notification delivered to Slack.", status: "delivered" };
  }

  const notConfigured = result.status === "not_configured";
  await writeAudit({
    action: "instance_admin.ops_test.send",
    actorId,
    after: { result: result.status },
    status: "failed",
    statusReason: notConfigured
      ? "Operator Slack notifications are not configured."
      : "Operator Slack test delivery failed.",
    targetId: "ops-slack",
    targetType: "instance_ops",
  });

  if (notConfigured) {
    return {
      message: "Slack operator notifications are not configured.",
      status: "not_configured",
    };
  }
  console.error(`[ops] admin Slack test failed: ${redactOpsText(result.error)}`);
  return {
    message: "Slack test delivery failed.",
    status: "delivery_failed",
  };
}

export async function runOpsSweepNow(): Promise<RunOpsSweepResult> {
  const session = await getInstanceAdminSession();
  if (!session) return forbiddenResult();

  const actorId = session.user.id;
  if (!getOpsConfig().enabled) {
    await writeAudit({
      action: "instance_admin.ops_sweep.run",
      actorId,
      after: { result: "not_configured" },
      status: "failed",
      statusReason: "Operator Slack notifications are not configured.",
      targetId: "ops-event-outbox",
      targetType: "instance_ops",
    });
    return {
      message: "Slack operator notifications are not configured.",
      status: "not_configured",
    };
  }

  const rateLimit = await consumeAdminAction(actorId, "sweep-outbox");
  if (!rateLimit) {
    await auditUnavailable(actorId, "instance_admin.ops_sweep.failed", "ops-event-outbox");
    return { message: "Admin action is temporarily unavailable.", status: "failed" };
  }
  if (!rateLimit.success) {
    await auditRateLimit(actorId, "instance_admin.ops_sweep.rate_limited", "ops-event-outbox");
    return limitedResult(rateLimit.resetAt);
  }

  let result: Awaited<ReturnType<typeof sweepUndeliveredOpsEvents>>;
  try {
    result = await sweepUndeliveredOpsEvents();
  } catch (error) {
    console.error(`[ops] admin outbox sweep failed: ${redactOpsText(error)}`);
    await writeAudit({
      action: "instance_admin.ops_sweep.run",
      actorId,
      after: { result: "failed" },
      status: "failed",
      statusReason: "Operator event outbox sweep failed.",
      targetId: "ops-event-outbox",
      targetType: "instance_ops",
    });
    return { message: "Outbox sweep failed.", status: "failed" };
  }
  await writeAudit({
    action: "instance_admin.ops_sweep.run",
    actorId,
    after: { attempted: result.attempted, delivered: result.delivered, result: "completed" },
    targetId: "ops-event-outbox",
    targetType: "instance_ops",
  });
  return {
    ...result,
    message: `Outbox sweep completed: ${result.delivered} of ${result.attempted} delivered.`,
    status: "completed",
  };
}
