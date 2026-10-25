export const CHECK_NOTIFICATION_SETTINGS = ["all", "important", "none"] as const;

export type CheckNotificationSettingValue = (typeof CHECK_NOTIFICATION_SETTINGS)[number];

export const PROVIDER_INCIDENT_IN_APP_DEFAULT = true;
export const CHECK_NOTIFICATION_SETTING_DEFAULT =
  "important" satisfies CheckNotificationSettingValue;
export const CHECK_NOTIFICATION_TOP_N = { min: 1, max: 100, default: 10 } as const;
export const CHECK_NOTIFICATION_POSITION_MOVE = { min: 1, max: 100, default: 5 } as const;

export const notificationPreferenceSelect = {
  alertEmail: true,
  alertInApp: true,
  checkEmail: true,
  checkInApp: true,
  checkNotificationPositionMove: true,
  checkNotificationSetting: true,
  checkNotificationTopN: true,
  importEmail: true,
  importInApp: true,
  inviteEmail: true,
  inviteInApp: true,
  providerIncidentInApp: true,
  reportEmail: true,
} as const;

export type StoredNotificationPreference = {
  alertEmail: boolean;
  alertInApp: boolean;
  checkEmail: boolean;
  checkInApp: boolean;
  checkNotificationPositionMove: number;
  checkNotificationSetting: CheckNotificationSettingValue;
  checkNotificationTopN: number;
  importEmail: boolean;
  importInApp: boolean;
  inviteEmail: boolean;
  inviteInApp: boolean;
  providerIncidentInApp: boolean;
  reportEmail: boolean;
};

export function notificationPreferencesForMissingRow(): StoredNotificationPreference {
  return {
    alertEmail: true,
    alertInApp: true,
    checkEmail: false,
    checkInApp: false,
    checkNotificationPositionMove: CHECK_NOTIFICATION_POSITION_MOVE.default,
    checkNotificationSetting: CHECK_NOTIFICATION_SETTING_DEFAULT,
    checkNotificationTopN: CHECK_NOTIFICATION_TOP_N.default,
    importEmail: true,
    importInApp: true,
    inviteEmail: true,
    inviteInApp: true,
    providerIncidentInApp: PROVIDER_INCIDENT_IN_APP_DEFAULT,
    reportEmail: true,
  };
}

/** Stored rows keep their own checkInApp. A missing row uses the shared defaults. */
export function resolveNotificationPreferences(
  stored: StoredNotificationPreference | null,
): StoredNotificationPreference {
  return stored ?? notificationPreferencesForMissingRow();
}

export function exportNotificationPreferenceFields(item: StoredNotificationPreference) {
  return {
    alert_email: item.alertEmail,
    alert_in_app: item.alertInApp,
    check_email: item.checkEmail,
    check_in_app: item.checkInApp,
    check_notification_position_move: item.checkNotificationPositionMove,
    check_notification_setting: item.checkNotificationSetting,
    check_notification_top_n: item.checkNotificationTopN,
    import_email: item.importEmail,
    import_in_app: item.importInApp,
    invite_email: item.inviteEmail,
    invite_in_app: item.inviteInApp,
    provider_incident_in_app: item.providerIncidentInApp,
    report_email: item.reportEmail,
  };
}
