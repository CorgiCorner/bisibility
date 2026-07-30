import "server-only";

import { updateNotificationPreferences } from "@/lib/actions/notification-prefs";
import { getNotificationPreferences } from "@/lib/queries/notification-prefs";
import { z } from "zod";
import type { ApiContext } from "./context";
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

const preferenceKeys = [
  "alertEmail",
  "alertInApp",
  "alertSlack",
  "alertWebhook",
  "checkEmail",
  "checkInApp",
  "importEmail",
  "importInApp",
  "inviteEmail",
  "inviteInApp",
] as const;

export async function getProjectNotificationPreferences(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;

  const preferences = await runDomain(() => getNotificationPreferences(projectId));

  return resourceResponse(snakeizeKeys(preferences), { headers: ctx.headers });
}

export async function updateProjectNotificationPreferences(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;

  const [body, current] = await Promise.all([
    readJsonBody(ctx),
    runDomain(() => getNotificationPreferences(projectId)),
  ]);
  const patch = parseApiInput(preferencePatchSchema, objectBody(body));
  const input = Object.fromEntries(preferenceKeys.map((key) => [key, patch[key] ?? current[key]]));
  const preferences = await runDomain(() => updateNotificationPreferences({ ...input, projectId }));

  return resourceResponse(snakeizeKeys(preferences), { headers: ctx.headers });
}
