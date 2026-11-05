import "server-only";

import { checkPreferencePatch } from "@/lib/notifications/check-preferences";
import {
  applyNotificationPreferences,
  PreferenceWriteError,
} from "@/lib/notifications/preferences-update";
import { readNotificationPreferencesFor } from "@/lib/queries/notification-prefs";
import { z } from "zod";
import { type ApiContext, forbidden } from "./context";
import { errorResponse, resourceResponse } from "./responses";
import {
  objectBody,
  parseApiInput,
  readJsonBody,
  runDomain,
  scopedProject,
  snakeizeKeys,
} from "./surface";

export const preferencePatchSchema = z
  .object({
    alertEmail: z.boolean().optional(),
    alertInApp: z.boolean().optional(),
    alertPush: z.boolean().optional(),
    /** Deprecated: project channel, ignored on personal writes with a warning. */
    alertSlack: z.boolean().optional(),
    /** Deprecated: project channel, ignored on personal writes with a warning. */
    alertWebhook: z.boolean().optional(),
    checkEmail: z.boolean().optional(),
    providerIncidentInApp: z.boolean().optional(),
    checkInApp: z.boolean().optional(),
    ...checkPreferencePatch,
    importEmail: z.boolean().optional(),
    importInApp: z.boolean().optional(),
    inviteEmail: z.boolean().optional(),
    inviteInApp: z.boolean().optional(),
  })
  .strict();

export async function getProjectNotificationPreferences(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;
  const actor = ctx.actor;
  if (!actor) {
    return forbidden(ctx, "This operation needs a project-scoped credential.");
  }

  const preferences = await runDomain(() => readNotificationPreferencesFor(actor, projectId));

  return resourceResponse(snakeizeKeys(preferences), { headers: ctx.headers });
}

export async function updateProjectNotificationPreferences(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;
  const actor = ctx.actor;
  if (!actor) {
    return forbidden(ctx, "This operation needs a project-scoped credential.");
  }

  const body = await readJsonBody(ctx);
  const patch = parseApiInput(preferencePatchSchema, objectBody(body));
  let updated: Awaited<ReturnType<typeof applyNotificationPreferences>>;
  try {
    updated = await applyNotificationPreferences(actor, { ...patch, projectId });
  } catch (error) {
    if (!(error instanceof PreferenceWriteError)) {
      return runDomain(async () => {
        throw error;
      });
    }
    const current = await runDomain(() => readNotificationPreferencesFor(actor, projectId));
    return errorResponse("internal_server_error", "Preference save could not be confirmed.", 500, {
      headers: ctx.headers,
      instance: ctx.instance,
      problemDetails: { current_preferences: snakeizeKeys(current) },
    });
  }
  const preferences = await runDomain(() => readNotificationPreferencesFor(actor, projectId));
  if (
    patch.checkInApp !== undefined ||
    patch.alertSlack !== undefined ||
    patch.alertWebhook !== undefined
  ) {
    ctx.headers.set("Deprecation", "@1792800000");
  }

  // The PATCH answer keeps its documented shape: account and availability fields stay on GET.
  const { email, emailVerification, slackAvailable, webhookAvailable, ...saved } = preferences;
  return resourceResponse(
    snakeizeKeys({ ...saved, ...(updated.warnings ? { warnings: updated.warnings } : {}) }),
    { headers: ctx.headers },
  );
}
