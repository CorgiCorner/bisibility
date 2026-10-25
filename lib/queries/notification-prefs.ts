import "server-only";

import { type Actor, authorize } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import { checkPreferenceSelect, checkPreferenceView } from "@/lib/notifications/check-preferences";
import type { CheckNotificationSettingValue } from "@/lib/notifications/preference-defaults";
import { notificationPreferencesForMissingRow } from "@/lib/notifications/preference-defaults";
import { getQueryActor } from "./_auth";

export type NotificationPreferencesView = {
  alertEmail: boolean;
  alertInApp: boolean;
  alertPush: boolean;
  providerIncidentInApp?: boolean;
  alertSlack: boolean;
  alertWebhook: boolean;
  checkEmail: boolean;
  checkInApp: boolean;
  checkNotificationSetting: CheckNotificationSettingValue;
  checkNotificationTopN: number;
  checkNotificationPositionMove: number;
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

const missingPreferences = notificationPreferencesForMissingRow();
const defaultPreferences = {
  alertEmail: missingPreferences.alertEmail,
  alertInApp: missingPreferences.alertInApp,
  alertPush: true,
  providerIncidentInApp: true,
  checkEmail: missingPreferences.checkEmail,
  ...checkPreferenceView(null),
  importEmail: missingPreferences.importEmail,
  importInApp: missingPreferences.importInApp,
  inviteEmail: missingPreferences.inviteEmail,
  inviteInApp: missingPreferences.inviteInApp,
  reportEmail: missingPreferences.reportEmail,
};

const preferenceSelect = {
  alertEmail: true,
  alertInApp: true,
  alertPush: true,
  providerIncidentInApp: true,
  checkEmail: true,
  ...checkPreferenceSelect,
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
    ...checkPreferenceView(preference),
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
