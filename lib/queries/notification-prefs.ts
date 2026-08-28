import "server-only";

import { type Actor, authorize } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import { getQueryActor } from "./_auth";

export type NotificationPreferencesView = {
  alertEmail: boolean;
  alertInApp: boolean;
  alertSlack: boolean;
  alertWebhook: boolean;
  checkEmail: boolean;
  checkInApp: boolean;
  email: string;
  emailVerification: "unverified" | "verified";
  importEmail: boolean;
  importInApp: boolean;
  inviteEmail: boolean;
  inviteInApp: boolean;
  projectId: string;
  reportEmail: boolean;
  slackAvailable: boolean;
  webhookAvailable: boolean;
};

const defaultPreferences = {
  alertEmail: true,
  alertInApp: true,
  checkEmail: false,
  checkInApp: false,
  importEmail: true,
  importInApp: true,
  inviteEmail: true,
  inviteInApp: true,
  reportEmail: true,
};

const preferenceSelect = {
  alertEmail: true,
  alertInApp: true,
  checkEmail: true,
  checkInApp: true,
  importEmail: true,
  importInApp: true,
  inviteEmail: true,
  inviteInApp: true,
  reportEmail: true,
};

export async function readNotificationPreferencesFor(
  actor: Actor,
  projectId: string,
): Promise<NotificationPreferencesView> {
  const project = await prisma.project.findFirst({
    select: { id: true, publicId: true },
    where: { publicId: projectId },
  });
  if (!project) {
    throw new Error("Project not found.");
  }
  authorize(actor, "read", { projectId: project.id, type: "project" });
  const [preference, user, slackConnection, webhookCount, enabledWebhookCount] = await Promise.all([
    prisma.notificationPreference.findUnique({
      select: preferenceSelect,
      where: { userId_projectId: { projectId: project.id, userId: actor.id } },
    }),
    prisma.user.findUnique({
      select: { email: true, emailVerified: true },
      where: { id: actor.id },
    }),
    prisma.slackConnection.findUnique({
      select: { enabled: true },
      where: { projectId: project.id },
    }),
    prisma.webhookEndpoint.count({ where: { projectId: project.id } }),
    prisma.webhookEndpoint.count({ where: { enabled: true, projectId: project.id } }),
  ]);

  if (!user) {
    throw new Error("User not found.");
  }

  return {
    ...defaultPreferences,
    ...preference,
    alertSlack: slackConnection?.enabled ?? false,
    alertWebhook: enabledWebhookCount > 0,
    email: user.email,
    emailVerification: user.emailVerified ? "verified" : "unverified",
    projectId: project.publicId,
    slackAvailable: Boolean(slackConnection),
    webhookAvailable: webhookCount > 0,
  };
}

export async function getNotificationPreferences(
  projectId: string,
): Promise<NotificationPreferencesView> {
  return readNotificationPreferencesFor(await getQueryActor(), projectId);
}
