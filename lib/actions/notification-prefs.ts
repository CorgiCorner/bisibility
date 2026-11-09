"use server";
import { recordAppAction } from "@/lib/activity/app-mutation";
import {
  applyNotificationPreferences,
  type NotificationPreferencesForm,
  notificationPreferencePatchSchema,
  PreferenceWriteError,
} from "@/lib/notifications/preferences-update";
import { readNotificationPreferencesFor } from "@/lib/queries/notification-prefs";
import { getActionActor, parseActionInput } from "./_shared";

export type { NotificationPreferencesForm };

export async function updateNotificationPreferences(input: unknown) {
  const data = parseActionInput(notificationPreferencePatchSchema, input);
  const actor = await getActionActor();
  try {
    const result = await applyNotificationPreferences(actor, data, () => recordAppAction(actor));
    return result;
  } catch (error) {
    // Authorization and validation failures keep their own errors; only an unconfirmed write
    // answers with the persisted state so the form can show what was actually saved.
    if (!(error instanceof PreferenceWriteError)) throw error;
    const current = await readNotificationPreferencesFor(actor, data.projectId);
    return { ...current, saveFailed: true as const };
  }
}
