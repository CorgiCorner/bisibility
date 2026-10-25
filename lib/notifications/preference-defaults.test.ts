import { describe, expect, it } from "vitest";
import {
  notificationPreferencesForMissingRow,
  resolveNotificationPreferences,
  type StoredNotificationPreference,
} from "./preference-defaults";

const stored = (
  checkInApp: boolean,
  setting: StoredNotificationPreference["checkNotificationSetting"] = "important",
): StoredNotificationPreference => ({
  ...notificationPreferencesForMissingRow(),
  checkInApp,
  checkNotificationSetting: setting,
});

describe("notification preference defaults", () => {
  it("uses Important, incident on, top 10 and a move of 5 when no row is stored", () => {
    expect(resolveNotificationPreferences(null)).toEqual(notificationPreferencesForMissingRow());
    expect(notificationPreferencesForMissingRow()).toMatchObject({
      checkInApp: false,
      checkNotificationPositionMove: 5,
      checkNotificationSetting: "important",
      checkNotificationTopN: 10,
      providerIncidentInApp: true,
    });
  });

  it("keeps a stored checkInApp value and the stored check setting", () => {
    expect(resolveNotificationPreferences(stored(true)).checkInApp).toBe(true);
    expect(resolveNotificationPreferences(stored(false)).checkInApp).toBe(false);
    expect(resolveNotificationPreferences(stored(false, "none")).checkNotificationSetting).toBe(
      "none",
    );
    expect(resolveNotificationPreferences(stored(true, "all")).checkNotificationSetting).toBe(
      "all",
    );
  });
});
