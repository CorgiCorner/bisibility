import {
  CHECK_NOTIFICATION_POSITION_MOVE,
  CHECK_NOTIFICATION_SETTING_DEFAULT,
  CHECK_NOTIFICATION_TOP_N,
  PROVIDER_INCIDENT_IN_APP_DEFAULT,
} from "@/lib/notifications/preference-defaults";
import type { notificationSettingsFormSchema } from "@/lib/notifications/preference-schema";
import type { NotificationPreferencesView } from "@/lib/queries/notification-prefs";
import type { z } from "zod";

export type NotificationPreferencesForm = z.infer<typeof notificationSettingsFormSchema>;

export function notificationPreferenceStamp(values: NotificationPreferencesForm) {
  return JSON.stringify(values);
}

export function formDefaults(
  preferences: NotificationPreferencesView,
): NotificationPreferencesForm {
  return {
    alertEmail: preferences.alertEmail,
    alertInApp: preferences.alertInApp,
    checkEmail: preferences.checkEmail,
    checkNotificationSetting:
      preferences.checkNotificationSetting ?? CHECK_NOTIFICATION_SETTING_DEFAULT,
    checkNotificationTopN: preferences.checkNotificationTopN ?? CHECK_NOTIFICATION_TOP_N.default,
    checkNotificationPositionMove:
      preferences.checkNotificationPositionMove ?? CHECK_NOTIFICATION_POSITION_MOVE.default,
    providerIncidentInApp: preferences.providerIncidentInApp ?? PROVIDER_INCIDENT_IN_APP_DEFAULT,
    importEmail: preferences.importEmail,
    importInApp: preferences.importInApp,
    inviteEmail: preferences.inviteEmail,
    inviteInApp: preferences.inviteInApp,
    projectId: preferences.projectId,
    reportEmail: preferences.reportEmail,
  };
}
