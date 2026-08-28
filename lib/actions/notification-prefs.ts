"use server";

import {
  applyNotificationPreferences,
  type NotificationPreferencesForm,
  notificationPreferenceSchema,
} from "@/lib/notifications/preferences-update";
import { getActionActor, parseActionInput } from "./_shared";

export type { NotificationPreferencesForm };

export async function updateNotificationPreferences(input: unknown) {
  const data = parseActionInput(notificationPreferenceSchema, input);
  const actor = await getActionActor();
  return applyNotificationPreferences(actor, data);
}
