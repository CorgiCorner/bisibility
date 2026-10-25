import { z } from "zod";
import {
  CHECK_NOTIFICATION_POSITION_MOVE,
  CHECK_NOTIFICATION_SETTING_DEFAULT,
  CHECK_NOTIFICATION_SETTINGS,
  CHECK_NOTIFICATION_TOP_N,
  type CheckNotificationSettingValue,
} from "./preference-defaults";

export const checkPreferencePatch = {
  checkNotificationSetting: z.enum(CHECK_NOTIFICATION_SETTINGS).optional(),
  checkNotificationTopN: z
    .number()
    .int()
    .min(CHECK_NOTIFICATION_TOP_N.min)
    .max(CHECK_NOTIFICATION_TOP_N.max)
    .optional(),
  checkNotificationPositionMove: z
    .number()
    .int()
    .min(CHECK_NOTIFICATION_POSITION_MOVE.min)
    .max(CHECK_NOTIFICATION_POSITION_MOVE.max)
    .optional(),
};

export const checkPreferenceSelect = {
  checkNotificationSetting: true,
  checkNotificationTopN: true,
  checkNotificationPositionMove: true,
} as const;

export function checkPreferenceView(
  stored: {
    checkNotificationSetting?: CheckNotificationSettingValue;
    checkNotificationTopN?: number;
    checkNotificationPositionMove?: number;
  } | null,
) {
  const checkNotificationSetting =
    stored?.checkNotificationSetting ?? CHECK_NOTIFICATION_SETTING_DEFAULT;
  return {
    checkInApp: checkNotificationSetting !== "none",
    checkNotificationSetting,
    checkNotificationTopN: stored?.checkNotificationTopN ?? CHECK_NOTIFICATION_TOP_N.default,
    checkNotificationPositionMove:
      stored?.checkNotificationPositionMove ?? CHECK_NOTIFICATION_POSITION_MOVE.default,
  };
}

export const legacyCheckPreferenceWarning = {
  code: "deprecated_field",
  field: "check_in_app",
  message:
    "check_in_app is read-only and ignored on writes. Use check_notification_setting instead.",
} as const;
