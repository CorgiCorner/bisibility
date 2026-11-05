import { z } from "zod";
import { checkPreferencePatch } from "./check-preferences";

const idSchema = z.string().trim().min(1).max(120);

export const notificationPreferenceSchema = z.object({
  alertEmail: z.boolean(),
  alertInApp: z.boolean(),
  /** Optional: forms without a push toggle keep the stored value. */
  alertPush: z.boolean().optional(),
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

export const notificationSettingsFormSchema = notificationPreferenceSchema.omit({
  checkInApp: true,
});

/**
 * Personal preference patch. alertSlack and alertWebhook stay accepted for older REST and MCP
 * clients, but they name project channels: the write ignores them and returns a warning.
 */
export const notificationPreferencePatchSchema = notificationPreferenceSchema
  .partial()
  .extend({
    alertSlack: z.boolean().optional(),
    alertWebhook: z.boolean().optional(),
    projectId: idSchema,
  })
  .strict();

export type NotificationPreferencesForm = z.infer<typeof notificationPreferencePatchSchema>;
