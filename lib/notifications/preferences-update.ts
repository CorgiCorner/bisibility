import "server-only";

import {
  requireProjectScope,
  revalidateAlertViews,
  revalidateSettingsViews,
} from "@/lib/actions/_shared";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import type { Actor } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import { revalidatePath } from "next/cache";
import {
  checkPreferenceSelect,
  checkPreferenceView,
  ignoredProjectChannelWarnings,
  legacyCheckPreferenceWarning,
} from "./check-preferences";

export {
  type NotificationPreferencesForm,
  notificationPreferencePatchSchema,
  notificationPreferenceSchema,
} from "./preference-schema";

import {
  type NotificationPreferencesForm,
  notificationPreferencePatchSchema,
} from "./preference-schema";

export class PreferenceWriteError extends Error {
  constructor(cause: unknown) {
    super("Preference save could not be confirmed.", { cause });
    this.name = "PreferenceWriteError";
  }
}

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

function preferenceWriteWarnings(data: NotificationPreferencesForm) {
  return [
    ...(data.checkInApp === undefined ? [] : [legacyCheckPreferenceWarning]),
    ...(data.alertSlack === undefined ? [] : [ignoredProjectChannelWarnings.alertSlack]),
    ...(data.alertWebhook === undefined ? [] : [ignoredProjectChannelWarnings.alertWebhook]),
  ];
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
  onCommitted?: () => void,
) {
  data = notificationPreferencePatchSchema.parse(data);
  const project = await requireProjectScope(actor, "update", data.projectId, {
    type: "notification_preference",
  });
  const preference = await prisma
    .$transaction(async (tx) => {
      const before = await tx.notificationPreference.findUnique({
        select: preferenceSelect,
        where: { userId_projectId: { projectId: project.id, userId: actor.id } },
      });
      const saved = await tx.notificationPreference.upsert({
        create: { ...preferenceData(data), projectId: project.id, userId: actor.id },
        select: preferenceSelect,
        update: preferenceData(data),
        where: { userId_projectId: { projectId: project.id, userId: actor.id } },
      });
      await writeAudit(
        {
          action: "notification_preferences.update",
          actorId: actor.id,
          after: { preference: saved },
          before: { preference: before },
          projectId: project.id,
          targetId: requiredPublicAuditId(project.publicId, "prj", "Project"),
          targetType: "project",
        },
        tx,
      );
      return saved;
    })
    .catch((cause: unknown) => {
      throw new PreferenceWriteError(cause);
    });
  onCommitted?.();
  try {
    revalidateNotificationPreferenceViews();
  } catch (cause) {
    throw new PreferenceWriteError(cause);
  }

  const warnings = preferenceWriteWarnings(data);
  return {
    ...preference,
    ...checkPreferenceView(preference),
    ...(warnings.length === 0 ? {} : { warnings }),
    projectId: data.projectId,
  };
}
