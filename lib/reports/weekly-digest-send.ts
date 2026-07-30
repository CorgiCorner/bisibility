import "server-only";

import { Prisma } from "@/lib/generated/prisma/client";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { sendEmail } from "@/lib/email/send";
import { collectWeeklyDigestData } from "./weekly-digest-data";
import { renderWeeklyDigestEmail } from "./weekly-digest-email";

const digestSentAction = "report.weekly_digest_sent";
const idempotencyWindowMs = 6 * 24 * 60 * 60 * 1000;

type DigestRecipientUser = {
  email: string;
  emailVerified: boolean;
  id: string;
  notificationPreferences: Array<{ reportEmail: boolean }>;
};

type ProjectAccess = {
  id: string;
  members: Array<{ user: DigestRecipientUser }>;
  owner: DigestRecipientUser;
  publicId: string;
};

export type WeeklyDigestSendResult =
  | { reason: "no_activity" | "no_project" | "no_recipients" | "recently_sent"; status: "skipped" }
  | {
      failedChecksCount: number;
      recipients: number;
      status: "sent";
      topMovers: number;
    };

function userSelect(projectId: string) {
  return {
    email: true,
    emailVerified: true,
    id: true,
    notificationPreferences: {
      select: { reportEmail: true },
      take: 1,
      where: { OR: [{ projectId }, { project: { publicId: projectId } }] },
    },
  } satisfies Prisma.UserSelect;
}

function projectAccessSelect(projectId: string) {
  return {
    id: true,
    members: { select: { user: { select: userSelect(projectId) } } },
    owner: { select: userSelect(projectId) },
    publicId: true,
  } satisfies Prisma.ProjectSelect;
}

async function projectAccess(projectId: string) {
  return prisma.project.findFirst({
    select: projectAccessSelect(projectId),
    where: { OR: [{ id: projectId }, { publicId: projectId }] },
  });
}

function reportEmailEnabled(user: DigestRecipientUser) {
  return user.emailVerified && (user.notificationPreferences[0]?.reportEmail ?? true);
}

function recipientEmails(project: ProjectAccess) {
  const users = [project.owner, ...project.members.map((member) => member.user)];
  const recipients = new Map<string, string>();

  for (const user of users) {
    if (reportEmailEnabled(user)) {
      recipients.set(user.id, user.email);
    }
  }

  return [...recipients.values()];
}

async function recentlySent(projectId: string, now: Date) {
  const sentAfter = new Date(now.getTime() - idempotencyWindowMs);
  const existing = await prisma.auditLog.findFirst({
    select: { id: true },
    where: {
      action: digestSentAction,
      createdAt: { gte: sentAfter },
      projectId,
      targetType: "project",
    },
  });

  return Boolean(existing);
}

export async function sendWeeklyDigestForProject(
  projectId: string,
  now: Date,
): Promise<WeeklyDigestSendResult> {
  const project = await projectAccess(projectId);
  if (!project) {
    return { reason: "no_project", status: "skipped" };
  }
  if (await recentlySent(project.id, now)) {
    return { reason: "recently_sent", status: "skipped" };
  }

  const recipients = recipientEmails(project);
  if (recipients.length === 0) {
    return { reason: "no_recipients", status: "skipped" };
  }

  const data = await collectWeeklyDigestData(project.id, now);
  if (!data) {
    return { reason: "no_activity", status: "skipped" };
  }

  const email = renderWeeklyDigestEmail(data);
  for (const to of recipients) {
    await sendEmail({ ...email, category: "bulk", to });
  }

  await writeAudit({
    action: digestSentAction,
    actorId: null,
    after: {
      failedChecksCount: data.failedChecksCount,
      recipients: recipients.length,
      topMovers: data.topMovers.length,
    },
    projectId: project.id,
    targetId: project.publicId,
    targetType: "project",
  });

  return {
    failedChecksCount: data.failedChecksCount,
    recipients: recipients.length,
    status: "sent",
    topMovers: data.topMovers.length,
  };
}
