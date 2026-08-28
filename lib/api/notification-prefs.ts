import "server-only";

import { canProjectAction } from "@/lib/auth/capabilities";
import {
  applyNotificationPreferences,
  type NotificationPreferencesForm,
} from "@/lib/notifications/preferences-update";
import { readNotificationPreferencesFor } from "@/lib/queries/notification-prefs";
import { z } from "zod";
import { type ApiContext, actorProjectRole, forbidden } from "./context";
import { resourceResponse } from "./responses";
import {
  objectBody,
  parseApiInput,
  readJsonBody,
  runDomain,
  scopedProject,
  snakeizeKeys,
} from "./surface";

const preferencePatchSchema = z
  .object({
    alertEmail: z.boolean().optional(),
    alertInApp: z.boolean().optional(),
    alertSlack: z.boolean().optional(),
    alertWebhook: z.boolean().optional(),
    checkEmail: z.boolean().optional(),
    checkInApp: z.boolean().optional(),
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

  const [body, current] = await Promise.all([
    readJsonBody(ctx),
    runDomain(() => readNotificationPreferencesFor(actor, projectId)),
  ]);
  const patch = parseApiInput(preferencePatchSchema, objectBody(body));
  const input: NotificationPreferencesForm = {
    alertEmail: patch.alertEmail ?? current.alertEmail,
    alertInApp: patch.alertInApp ?? current.alertInApp,
    alertSlack: patch.alertSlack ?? current.alertSlack,
    alertWebhook: patch.alertWebhook ?? current.alertWebhook,
    checkEmail: patch.checkEmail ?? current.checkEmail,
    checkInApp: patch.checkInApp ?? current.checkInApp,
    importEmail: patch.importEmail ?? current.importEmail,
    importInApp: patch.importInApp ?? current.importInApp,
    inviteEmail: patch.inviteEmail ?? current.inviteEmail,
    inviteInApp: patch.inviteInApp ?? current.inviteInApp,
    projectId,
    // Not part of the REST patch surface; the row keeps its current value.
    reportEmail: current.reportEmail,
  };
  // Same escalation the app action applies: switching Slack or webhook delivery
  // touches a shared project channel, not a personal preference.
  const externalChanged =
    input.alertSlack !== current.alertSlack || input.alertWebhook !== current.alertWebhook;
  if (
    externalChanged &&
    !canProjectAction(actorProjectRole(ctx), "manage", "notification_delivery_channel")
  ) {
    return forbidden(ctx, "Your project role does not allow changing delivery channels.");
  }
  // The service takes the API actor directly; the app action wraps the same service around
  // the browser session, so both surfaces answer to one implementation.
  const preferences = await runDomain(() => applyNotificationPreferences(actor, input));

  return resourceResponse(snakeizeKeys(preferences), { headers: ctx.headers });
}
