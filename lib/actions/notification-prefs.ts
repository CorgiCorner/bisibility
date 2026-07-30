"use server";

import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { authorize } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateAlertViews,
  revalidateSettingsViews,
} from "./_shared";

const idSchema = z.string().trim().min(1).max(120);

const notificationPreferenceSchema = z.object({
  alertEmail: z.boolean(),
  alertInApp: z.boolean(),
  alertSlack: z.boolean(),
  alertWebhook: z.boolean(),
  checkEmail: z.boolean(),
  checkInApp: z.boolean(),
  importEmail: z.boolean(),
  importInApp: z.boolean(),
  inviteEmail: z.boolean(),
  inviteInApp: z.boolean(),
  projectId: idSchema,
  reportEmail: z.boolean(),
});

export type NotificationPreferencesForm = z.infer<typeof notificationPreferenceSchema>;

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

function preferenceData(data: NotificationPreferencesForm) {
  return {
    alertEmail: data.alertEmail,
    alertInApp: data.alertInApp,
    checkEmail: data.checkEmail,
    checkInApp: data.checkInApp,
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

export async function updateNotificationPreferences(input: unknown) {
  const data = parseActionInput(notificationPreferenceSchema, input);
  const actor = await getActionActor();
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
    alertSlack: data.alertSlack,
    alertWebhook: data.alertWebhook,
    projectId: data.projectId,
  };
}
