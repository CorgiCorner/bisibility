import "server-only";

import type { AlertExternalDeliveryPayload } from "@/lib/alerts/alert-delivery-payload";
import { prisma } from "@/lib/db/prisma";
import { NotificationType, type Prisma } from "@/lib/generated/prisma/client";
import { migrationImportCountSummary } from "@/lib/migration/import-counts";
import { appPath } from "@/lib/routing/app-path";
import { createNotification } from "./create";
import type { NotificationPayload } from "./format";

type NotificationObjectPayload = { [key: string]: NotificationPayload };

type ProjectMemberNotificationInput = {
  body?: string | null;
  hrefSegments?: string[];
  idempotencyKey: string;
  payload?: NotificationObjectPayload;
  projectId: string;
  title: string;
  type: NotificationType;
};

type RankFailureInput = {
  code: string;
  failedAt: Date;
  keywordId: string;
  keywordPublicId: string;
  keywordText: string;
  message: string;
  projectDomain: string;
  projectId: string;
};

type TriggeredAlertNotificationInput = {
  payload: AlertExternalDeliveryPayload;
  projectInternalId: string;
  triggeredAlertId: string;
};

type CloudImportDoneInput = {
  counts?: Prisma.JsonValue | null;
  jobId: string;
  projectId: string;
};

type CloudImportFailedInput = {
  error?: string | null;
  jobId: string;
  projectId: string;
};

function payloadWithKey(payload: NotificationObjectPayload | undefined, idempotencyKey: string) {
  return { ...payload, idempotencyKey } satisfies NotificationObjectPayload;
}

function positionLabel(position: number | null) {
  return position ? `#${position}` : "No rank";
}

function countsBody(counts: Prisma.JsonValue | null | undefined) {
  const countsSummary = migrationImportCountSummary(counts);
  let summary = "Cloud import finished.";
  if (countsSummary.imported.length) summary = `Imported ${countsSummary.imported.join(", ")}.`;
  else if (countsSummary.keywordsReceived > 0) {
    const noun = countsSummary.keywordsReceived === 1 ? "keyword" : "keywords";
    summary = `Processed ${countsSummary.keywordsReceived} ${noun} - nothing new to import.`;
  }
  return countsSummary.skipped.length > 0
    ? `${summary} ${countsSummary.skipped.join(", ")} skipped.`
    : summary;
}

async function projectMemberContext(projectId: string) {
  const project = await prisma.project.findUnique({
    select: { members: { select: { userId: true } }, ownerId: true, publicId: true },
    where: { id: projectId },
  });

  if (!project) {
    return null;
  }

  return {
    projectRef: project.publicId,
    userIds: [...new Set([project.ownerId, ...project.members.map((member) => member.userId)])],
  };
}

async function createProjectNotificationForUser(
  userId: string,
  input: ProjectMemberNotificationInput,
  projectRef: string,
) {
  const payload = payloadWithKey(
    input.hrefSegments
      ? { ...input.payload, href: appPath(projectRef, ...input.hrefSegments) }
      : input.payload,
    input.idempotencyKey,
  );
  const existing = await prisma.notification.findFirst({
    select: { id: true },
    where: { idempotencyKey: input.idempotencyKey, userId },
  });

  if (existing) {
    return;
  }

  await createNotification(
    userId,
    input.projectId,
    input.type,
    input.title,
    input.body,
    payload,
    input.idempotencyKey,
  );
}

export async function notifyProjectMembers(input: ProjectMemberNotificationInput) {
  try {
    const context = await projectMemberContext(input.projectId);
    if (!context) {
      return;
    }
    await Promise.allSettled(
      context.userIds.map((userId) =>
        createProjectNotificationForUser(userId, input, context.projectRef),
      ),
    );
  } catch {
    return;
  }
}

export async function notifyRankCheckCompleted(input: {
  checkedAt: Date;
  keywordId: string;
  position: number | null;
  previousPosition: number | null;
  projectId: string;
  rankCheckId: string;
}) {
  if (input.position === input.previousPosition) {
    return;
  }

  try {
    const keyword = await prisma.keyword.findUnique({
      select: {
        project: { select: { domain: true } },
        publicId: true,
        text: true,
      },
      where: { id: input.keywordId },
    });

    if (!keyword) {
      return;
    }

    await notifyProjectMembers({
      body: `${keyword.text} is ${positionLabel(input.position)}.`,
      hrefSegments: ["keywords", keyword.publicId],
      idempotencyKey: `rank-check:${input.rankCheckId}:complete`,
      payload: {
        checkedAt: input.checkedAt.toISOString(),
        keyword: keyword.text,
        keywordId: keyword.publicId,
        meta: `${keyword.text} on ${keyword.project.domain}`,
        position: input.position,
        previousPosition: input.previousPosition,
        rankCheckId: input.rankCheckId,
      },
      projectId: input.projectId,
      title: "Rank check complete",
      type: NotificationType.check_complete,
    });
  } catch {
    return;
  }
}

export async function notifyRankCheckFailed(input: RankFailureInput) {
  await notifyProjectMembers({
    body: `${input.keywordText}: ${input.message}`,
    hrefSegments: ["integrations"],
    idempotencyKey: `rank-check:${input.keywordId}:failed:${input.code}:${input.failedAt.toISOString()}`,
    payload: {
      errorCode: input.code,
      failedAt: input.failedAt.toISOString(),
      keyword: input.keywordText,
      keywordId: input.keywordPublicId,
      meta: `${input.keywordText} on ${input.projectDomain}`,
    },
    projectId: input.projectId,
    title: "Rank check failed",
    type: NotificationType.check_failed,
  });
}

// In-app alerts intentionally reach all members via alertInApp. Batch 6 owns email targeting,
// and Batch 3 owns per-run digesting.
export async function notifyTriggeredAlertDelivered(input: TriggeredAlertNotificationInput) {
  const { payload } = input;
  await notifyProjectMembers({
    body: payload.action,
    hrefSegments: ["alerts"],
    idempotencyKey: `triggered-alert:${input.triggeredAlertId}:delivered`,
    payload: {
      afterPosition: payload.afterPosition,
      alertId: payload.alertId,
      beforePosition: payload.beforePosition,
      conditionType: payload.conditionType,
      firedAt: payload.firedAt,
      keyword: payload.keyword,
      keywordId: payload.keywordId,
      meta: `${payload.keyword} on ${payload.projectDomain}`,
      ruleId: payload.ruleId,
      ruleName: payload.ruleName,
    },
    projectId: input.projectInternalId,
    title: payload.headline,
    type: NotificationType.alert_fired,
  });
}

export async function notifyCloudImportDone(input: CloudImportDoneInput) {
  const body = countsBody(input.counts);

  await notifyProjectMembers({
    body,
    hrefSegments: ["keywords"],
    idempotencyKey: `cloud-import:${input.jobId}:done`,
    payload: {
      counts: (input.counts ?? null) as NotificationPayload,
      // Land on the imported data, not on an unrelated page.
      jobId: input.jobId,
      meta: body,
    },
    projectId: input.projectId,
    title: "Cloud import complete",
    type: NotificationType.import_done,
  });
}

export async function notifyCloudImportFailed(input: CloudImportFailedInput) {
  const body = input.error?.trim() || "Cloud import failed.";

  await notifyProjectMembers({
    body,
    hrefSegments: ["settings", "import"],
    idempotencyKey: `cloud-import:${input.jobId}:failed`,
    payload: {
      error: body,
      // The import status page shows the failed job and lets the user retry.
      jobId: input.jobId,
      meta: body,
    },
    projectId: input.projectId,
    title: "Cloud import failed",
    type: NotificationType.import_failed,
  });
}
