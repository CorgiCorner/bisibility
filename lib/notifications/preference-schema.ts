import { z } from "zod";
import { checkPreferencePatch } from "./check-preferences";

const idSchema = z.string().trim().min(1).max(120);

export const notificationPreferenceSchema = z.object({
  alertEmail: z.boolean(),
  alertInApp: z.boolean(),
  /** Optional: forms without a push toggle keep the stored value. */
  alertPush: z.boolean().optional(),
  alertSlack: z.boolean(),
  alertWebhook: z.boolean(),
  checkEmail: z.boolean(),
  checkInApp: z.boolean().optional(),
  ...checkPreferencePatch,
  importEmail: z.boolean(),
  importInApp: z.boolean(),
  inviteEmail: z.boolean(),
  inviteInApp: z.boolean(),
  projectId: idSchema,
  reportEmail: z.boolean(),
  providerIncidentInApp: z.boolean().optional(),
});

export type NotificationPreferencesForm = z.infer<typeof notificationPreferenceSchema>;

export const notificationSettingsFormSchema = notificationPreferenceSchema.omit({
  checkInApp: true,
});
