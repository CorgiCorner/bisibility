import {
  exportNotificationPreferenceFields,
  notificationPreferencesForMissingRow,
} from "@/lib/notifications/preference-defaults";
import { describe, expect, it } from "vitest";
import { notificationPreferenceSchema } from "./notification-preference-schema";

describe("portable notification preferences", () => {
  it.each([true, false, undefined])(
    "imports legacy checkInApp=%s as Important without rewriting the old value",
    (checkInApp) => {
      expect(notificationPreferenceSchema.parse({ check_in_app: checkInApp })).toMatchObject({
        checkInApp: checkInApp ?? false,
        checkNotificationSetting: "important",
        checkNotificationTopN: 10,
        checkNotificationPositionMove: 5,
        providerIncidentInApp: true,
      });
    },
  );
  it.each(["all", "important", "none"] as const)(
    "round-trips %s with configured thresholds",
    (setting) => {
      const stored = {
        ...notificationPreferencesForMissingRow(),
        checkInApp: false,
        checkNotificationSetting: setting,
        checkNotificationTopN: 100,
        checkNotificationPositionMove: 1,
        providerIncidentInApp: false,
      };
      expect(
        notificationPreferenceSchema.parse(exportNotificationPreferenceFields(stored)),
      ).toEqual(stored);
    },
  );
  it.each(["check_notification_top_n", "check_notification_position_move"])(
    "rejects out-of-range %s",
    (field) => {
      for (const value of [0, 101, 1.5]) {
        expect(notificationPreferenceSchema.safeParse({ [field]: value }).success).toBe(false);
      }
    },
  );
});
