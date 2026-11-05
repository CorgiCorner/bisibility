import "server-only";
import { prisma } from "@/lib/db/prisma";
import { isLocalDevelopmentDeployment } from "@/lib/deployment/deployment";
import { EmailNotSubmittedError, EmailProviderUnavailableError } from "@/lib/email/types";
import { readOnlyDemoConfig } from "@/lib/demo/config";
import { notificationUnsubscribeFooter, notificationUnsubscribeUrl } from "@/lib/email/notification-unsubscribe";
import { resolveCanonicalOrigin } from "@/lib/seo/origin";
import { sendEmail } from "@/lib/email/send";
import { notifyOps } from "@/lib/ops/notify";
import { recoverySwitches } from "@/lib/provider-evidence/recovery/switches";
import { collectWeeklyDigestData } from "./weekly-digest-data";
import { renderWeeklyDigestEmail } from "./weekly-digest-email";
import { digestSentAction, finalizeDigest } from "./weekly-digest-finalize";
import { weeklyDigestPeriod } from "./weekly-digest-period";
import { digestCandidates, digestRecipient, digestUserSelect } from "./weekly-digest-recipients";
import { claimDigest, finishDigest } from "./weekly-digest-records";

const idempotencyWindowMs = 6 * 24 * 60 * 60 * 1000;
export type WeeklyDigestSendResult =
  | {
      reason: "demo" | "no_activity" | "no_project" | "no_recipients" | "recently_sent";
      status: "skipped";
    }
  | {
      failedChecksCount: number;
      recipients: number;
      status: "sent";
      topMovers: number;
      failed: number;
      ambiguous: number;
      skippedRecipients: number;
    };

async function recentlySent(projectId: string, now: Date) {
  return Boolean(
    await prisma.auditLog.findFirst({
      select: { id: true },
      where: {
        action: digestSentAction,
        createdAt: { gte: new Date(now.getTime() - idempotencyWindowMs) },
        projectId,
        targetType: "project",
      },
    }),
  );
}

export async function sendWeeklyDigestForProject(
  projectId: string,
  now: Date,
  incidentDigest = recoverySwitches().incidentDigest,
): Promise<WeeklyDigestSendResult> {
  // Only the legacy read-only snapshot has no mail; editable demo filters the Viewer per recipient.
  if (readOnlyDemoConfig()) return { status: "skipped", reason: "demo" };
  const period = weeklyDigestPeriod(now);
  const userSelect = {
    ...digestUserSelect,
    notificationPreferences: {
      ...digestUserSelect.notificationPreferences,
      where: { OR: [{ projectId }, { project: { publicId: projectId } }] },
      take: 1,
    },
  };
  const project = await prisma.project.findFirst({
    where: { OR: [{ id: projectId }, { publicId: projectId }], writeMode: { not: "migrated" } },
    select: {
      id: true,
      publicId: true,
      owner: { select: userSelect },
      members: { select: { user: { select: userSelect } } },
    },
  });
  if (!project) return { reason: "no_project", status: "skipped" };
  if (await recentlySent(project.id, now)) return { reason: "recently_sent", status: "skipped" };
  const recipients = digestCandidates(project);
  if (!recipients.length) return { reason: "no_recipients", status: "skipped" };
  const data = await collectWeeklyDigestData(project.id, now, incidentDigest);
  if (!data) return { reason: "no_activity", status: "skipped" };
  const email = renderWeeklyDigestEmail(data);
  for (const userId of recipients) {
    if (!(await digestRecipient(userId, project.id))) continue;
    const key = { ...period, projectId: project.id, userId };
    if (!(await claimDigest(key))) continue;
    const to = await digestRecipient(userId, project.id);
    if (!to) {
      await prisma.weeklyDigestSend.deleteMany({ where: { ...key, status: "claimed" } });
      continue;
    }
    try {
      let url: string;
      try {
        url = notificationUnsubscribeUrl({ userId, projectId: project.id, stream: "report" }, resolveCanonicalOrigin());
      } catch (error) {
        throw new EmailNotSubmittedError(error);
      }
      await sendEmail({ ...email, ...notificationUnsubscribeFooter(email, url), listUnsubscribeUrl: url, category: "bulk", to, requireProvider: true });
    } catch (error) {
      if (
        error instanceof EmailNotSubmittedError &&
        error.cause instanceof EmailProviderUnavailableError &&
        isLocalDevelopmentDeployment()
      ) {
        const subject = email.subject.replace(/^\[bisibility\] /, "");
        console.info(`[email] ${subject} for ${to}\n${email.text}`);
        await finishDigest(key, { status: "skipped" });
        continue;
      }
      await finishDigest(key, { error });
      continue;
    }
    // Persistence failure after handoff must leave claimed, never a retryable transport failure.
    await finishDigest(key, { status: "sent" });
  }
  const metrics = { failedChecksCount: data.failedChecksCount, topMovers: data.topMovers.length };
  const outcome = await finalizeDigest(project, now, metrics, incidentDigest);
  if (outcome.ambiguous)
    await notifyOps({
      dedupeKey: `weekly-digest-ambiguous:${project.id}:${now.toISOString()}`,
      fields: { projectId: project.id, periodEnd: now.toISOString(), ambiguous: outcome.ambiguous },
      kind: "weekly_digest_ambiguous",
      severity: "warning",
      title: "Weekly digest delivery needs reconciliation",
    });
  return {
    ...metrics,
    status: "sent",
    recipients: outcome.sent,
    failed: outcome.failed,
    ambiguous: outcome.ambiguous,
    skippedRecipients: outcome.skipped,
  };
}
