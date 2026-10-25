import {
  CHECK_NOTIFICATION_POSITION_MOVE,
  CHECK_NOTIFICATION_SETTING_DEFAULT,
  CHECK_NOTIFICATION_SETTINGS,
  CHECK_NOTIFICATION_TOP_N,
  notificationPreferencesForMissingRow,
  PROVIDER_INCIDENT_IN_APP_DEFAULT,
} from "@/lib/notifications/preference-defaults";
import { z } from "zod";

export const notificationPreferenceSchema = z
  .object({
    alert_email: z.boolean().optional(),
    alert_in_app: z.boolean().optional(),
    check_email: z.boolean().optional(),
    check_in_app: z.boolean().optional(),
    check_notification_position_move: z
      .number()
      .int()
      .min(CHECK_NOTIFICATION_POSITION_MOVE.min)
      .max(CHECK_NOTIFICATION_POSITION_MOVE.max)
      .optional(),
    check_notification_setting: z.enum(CHECK_NOTIFICATION_SETTINGS).optional(),
    check_notification_top_n: z
      .number()
      .int()
      .min(CHECK_NOTIFICATION_TOP_N.min)
      .max(CHECK_NOTIFICATION_TOP_N.max)
      .optional(),
    import_email: z.boolean().optional(),
    import_in_app: z.boolean().optional(),
    invite_email: z.boolean().optional(),
    invite_in_app: z.boolean().optional(),
    provider_incident_in_app: z.boolean().optional(),
    report_email: z.boolean().optional(),
  })
  .strict()
  .transform((value) => ({
    ...notificationPreferencesForMissingRow(),
    alertEmail: value.alert_email ?? true,
    alertInApp: value.alert_in_app ?? true,
    checkEmail: value.check_email ?? false,
    checkInApp: value.check_in_app ?? false,
    checkNotificationPositionMove:
      value.check_notification_position_move ?? CHECK_NOTIFICATION_POSITION_MOVE.default,
    checkNotificationSetting:
      value.check_notification_setting ?? CHECK_NOTIFICATION_SETTING_DEFAULT,
    checkNotificationTopN: value.check_notification_top_n ?? CHECK_NOTIFICATION_TOP_N.default,
    importEmail: value.import_email ?? true,
    importInApp: value.import_in_app ?? true,
    inviteEmail: value.invite_email ?? true,
    inviteInApp: value.invite_in_app ?? true,
    providerIncidentInApp: value.provider_incident_in_app ?? PROVIDER_INCIDENT_IN_APP_DEFAULT,
    reportEmail: value.report_email ?? true,
  }));
