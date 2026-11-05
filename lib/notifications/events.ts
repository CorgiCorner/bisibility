import { createHash } from "node:crypto";
import { checkNotificationSummariesEnabled } from "./check-summaries/switch";
import "server-only";

import { prisma } from "@/lib/db/prisma";
import { isPublicIdOfType } from "@/lib/db/public-id";
import { NotificationType, type Prisma } from "@/lib/generated/prisma/client";
import { migrationImportCountSummary } from "@/lib/migration/import-counts";
import type { RankCheckFailureCode } from "@/lib/rank-check/failure-presentation";
import { appPath } from "@/lib/routing/app-path";
import {
  type TriggeredAlertNotificationInput,
  triggeredAlertNotificationInput,
} from "./alert-delivery";
import { createNotification } from "./create";
import type { NotificationPayload } from "./format";

export { notifyTriggeredAlertsDelivered } from "./alert-delivery";

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
  code: RankCheckFailureCode;
  failedAt: Date;
  keywordId: string;
  keywordPublicId: string;
  keywordText: string;
  message: string;
  projectDomain: string;
  projectId: string;
  rankCheckId: string;
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
  let summary = "Instance import finished.";
  if (countsSummary.imported.length) summary = `Imported ${countsSummary.imported.join(", ")}.`;
  else if (countsSummary.keywordsReceived > 0) {
    const noun = countsSummary.keywordsReceived === 1 ? "keyword" : "keywords";
    summary = `Processed ${countsSummary.keywordsReceived} ${noun} - nothing new to import.`;
  }
  return countsSummary.skipped.length > 0
    ? `${summary} ${countsSummary.skipped.join(", ")} skipped.`
    : summary;
}

async function projectMemberContext(projectId: string, db: Prisma.TransactionClient) {
  const project = await db.project.findUnique({
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
  transaction?: Prisma.TransactionClient,
) {
  const payload = payloadWithKey(
    input.hrefSegments
      ? { ...input.payload, href: appPath(projectRef, ...input.hrefSegments) }
      : input.payload,
    input.idempotencyKey,
  );
  if (!transaction) {
    const existing = await prisma.notification.findFirst({
      select: { id: true },
      where: { idempotencyKey: input.idempotencyKey, userId },
    });
    if (existing) return;
  }

  const args = [
    userId,
    input.projectId,
    input.type,
    input.title,
    input.body,
    payload,
    input.idempotencyKey,
  ] as const;
  await (transaction ? createNotification(...args, transaction) : createNotification(...args));
}

export async function notifyProjectMembers(
  input: ProjectMemberNotificationInput,
  transaction?: Prisma.TransactionClient,
) {
  const context = await projectMemberContext(input.projectId, transaction ?? prisma);
  if (!context) return;
  for (const userId of context.userIds) {
    await createProjectNotificationForUser(userId, input, context.projectRef, transaction);
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
  if (checkNotificationSummariesEnabled()) return;
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
      hrefSegments: ["rank-tracker", keyword.publicId],
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

function checksHrefSegments(rankCheckId: string): string[] {
  return isPublicIdOfType(rankCheckId, "rcr") ? ["runs", "rank-checks", rankCheckId] : ["runs"];
}

export async function notifyRankCheckFailed(input: RankFailureInput) {
  if (checkNotificationSummariesEnabled()) return;
  await notifyProjectMembers({
    body: `${input.keywordText}: ${input.message}`,
    hrefSegments: checksHrefSegments(input.rankCheckId),
    idempotencyKey: `rank-check:${input.keywordId}:failed:${input.code}:${input.failedAt.toISOString()}`,
    payload: {
      errorCode: input.code,
      failedAt: input.failedAt.toISOString(),
      keyword: input.keywordText,
      keywordId: input.keywordPublicId,
      meta: `${input.keywordText} on ${input.projectDomain}`,
      rankCheckId: input.rankCheckId,
    },
    projectId: input.projectId,
    title: "Rank check failed",
    type: NotificationType.check_failed,
  });
}

// In-app alerts intentionally reach all members via alertInApp. Batch 6 owns email targeting,
// and Batch 3 owns per-run digesting.
export async function notifyTriggeredAlertDelivered(
  input: TriggeredAlertNotificationInput,
  transaction?: Prisma.TransactionClient,
) {
  await notifyProjectMembers(triggeredAlertNotificationInput(input), transaction);
}

export async function notifyCloudImportDone(input: CloudImportDoneInput) {
  const body = countsBody(input.counts);

  await notifyProjectMembers({
    body,
    hrefSegments: ["rank-tracker"],
    idempotencyKey: `cloud-import:${input.jobId}:done`,
    payload: {
      counts: (input.counts ?? null) as NotificationPayload,
      // Land on the imported data, not on an unrelated page.
      jobId: input.jobId,
      meta: body,
    },
    projectId: input.projectId,
    title: "Instance import complete",
    type: NotificationType.import_done,
  });
}

export async function notifyCloudImportFailed(input: CloudImportFailedInput) {
  const body = input.error?.trim() || "Instance import failed.";

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
    title: "Instance import failed",
    type: NotificationType.import_failed,
  });
}

/**
 * One notice per recipient, project, blocker and UTC month of the expiry,
 * independent of keywords or cadence. The month bucket separates episodes: a
 * blocker that clears and recurs in a later month notifies again.
 */
export async function notifyScheduleBlocked(projectId: string, reason: string, expiredAt: Date) {
  const reasonKey = createHash("sha256").update(reason).digest("hex");
  const episode = expiredAt.toISOString().slice(0, 7);
  await notifyProjectMembers({
    projectId,
    type: NotificationType.system,
    title: "Scheduled check blocked",
    body: "A scheduled check could not run. Review the run history for the cause.",
    hrefSegments: ["runs"],
    idempotencyKey: `schedule-block:${projectId}:${episode}:${reasonKey}`,
  });
}
