import "server-only";

import {
  requireProjectScope,
  revalidateAlertViews,
  revalidateSettingsViews,
} from "@/lib/actions/_shared";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { type Actor, authorize } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import { revalidatePath } from "next/cache";
import {
  checkPreferenceSelect,
  checkPreferenceView,
  legacyCheckPreferenceWarning,
} from "./check-preferences";

export {
  type NotificationPreferencesForm,
  notificationPreferenceSchema,
} from "./preference-schema";

import {
  type NotificationPreferencesForm,
  notificationPreferenceSchema,
} from "./preference-schema";

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

function preferenceData(data: NotificationPreferencesForm) {
  return {
    alertEmail: data.alertEmail,
    alertInApp: data.alertInApp,
    ...(data.alertPush === undefined ? {} : { alertPush: data.alertPush }),
    checkEmail: data.checkEmail,
    ...(data.providerIncidentInApp === undefined
      ? {}
      : { providerIncidentInApp: data.providerIncidentInApp }),
    ...(data.checkNotificationSetting === undefined
      ? {}
      : { checkNotificationSetting: data.checkNotificationSetting }),
    ...(data.checkNotificationTopN === undefined
      ? {}
      : { checkNotificationTopN: data.checkNotificationTopN }),
    ...(data.checkNotificationPositionMove === undefined
      ? {}
      : { checkNotificationPositionMove: data.checkNotificationPositionMove }),
    importEmail: data.importEmail,
    importInApp: data.importInApp,
    inviteEmail: data.inviteEmail,
    inviteInApp: data.inviteInApp,
    reportEmail: data.reportEmail,
  };
}

async function currentChannels(projectId: string) {
  const [slackConnection, webhookCount, enabledWebhookCount] = await Promise.all([
    prisma.slackConnection.findUnique({
      select: { enabled: true, id: true },
      where: { projectId },
    }),
    prisma.webhookEndpoint.count({ where: { projectId } }),
    prisma.webhookEndpoint.count({ where: { enabled: true, projectId } }),
  ]);
  return {
    alertSlack: slackConnection?.enabled ?? false,
    alertWebhook: enabledWebhookCount > 0,
    slackAvailable: Boolean(slackConnection),
    webhookAvailable: webhookCount > 0,
  };
}

function revalidateNotificationPreferenceViews() {
  revalidateSettingsViews();
  revalidateAlertViews();
  revalidatePath("/app", "layout");
}

/**
 * Applies a notification preference update for an explicit actor. The app action wraps this
 * around the browser session; the REST handler passes the credential's actor, so bearer calls
 * get the same role rules and audit trail without a cookie session.
 */
export async function applyNotificationPreferences(
  actor: Actor,
  data: NotificationPreferencesForm,
) {
  data = notificationPreferenceSchema.parse(data);
  const project = await requireProjectScope(actor, "update", data.projectId, {
    type: "notification_preference",
  });
  const [before, beforeChannels] = await Promise.all([
    prisma.notificationPreference.findUnique({
      select: preferenceSelect,
      where: { userId_projectId: { projectId: project.id, userId: actor.id } },
    }),
    currentChannels(project.id),
  ]);
  const externalChanged =
    data.alertSlack !== beforeChannels.alertSlack ||
    data.alertWebhook !== beforeChannels.alertWebhook;

  if (data.alertSlack && !beforeChannels.slackAvailable) {
    throw new Error("Slack delivery is not configured for this project.");
  }
  if (data.alertWebhook && !beforeChannels.webhookAvailable) {
    throw new Error("Webhook delivery is not configured for this project.");
  }
  if (externalChanged) {
    authorize(actor, "manage", { projectId: project.id, type: "notification_delivery_channel" });
  }

  const preference = await prisma.notificationPreference.upsert({
    create: { ...preferenceData(data), projectId: project.id, userId: actor.id },
    select: preferenceSelect,
    update: preferenceData(data),
    where: { userId_projectId: { projectId: project.id, userId: actor.id } },
  });

  if (data.alertSlack !== beforeChannels.alertSlack) {
    await prisma.slackConnection.update({
      data: { enabled: data.alertSlack },
      where: { projectId: project.id },
    });
  }
  if (data.alertWebhook !== beforeChannels.alertWebhook) {
    await prisma.webhookEndpoint.updateMany({
      data: { enabled: data.alertWebhook },
      where: { projectId: project.id },
    });
  }

  await writeAudit({
    action: "notification_preferences.update",
    actorId: actor.id,
    after: {
      channels: { alertSlack: data.alertSlack, alertWebhook: data.alertWebhook },
      preference,
    },
    before: { channels: beforeChannels, preference: before },
    projectId: project.id,
    targetId: requiredPublicAuditId(project.publicId, "prj", "Project"),
    targetType: "project",
  });
  revalidateNotificationPreferenceViews();

  return {
    ...preference,
    ...checkPreferenceView(preference),
    ...(data.checkInApp === undefined ? {} : { warnings: [legacyCheckPreferenceWarning] }),
    alertSlack: data.alertSlack,
    alertWebhook: data.alertWebhook,
    projectId: data.projectId,
  };
}
