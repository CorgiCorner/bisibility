"use server";

import { deleteSavedViewSchema } from "@/lib/keywords/saved-view-model";
import { createProjectSavedViewSchema } from "@/lib/saved-views/model";
import { createSavedViewFor, deleteSavedViewFor } from "@/lib/saved-views/service";
import { getActionActor, parseActionInput } from "./_shared";

export async function createSavedView(input: unknown) {
  const data = parseActionInput(createProjectSavedViewSchema, input);
  const actor = await getActionActor();
  return createSavedViewFor(data, { actor, auditActorId: actor.id });
}

export async function deleteSavedView(input: unknown) {
  const data = parseActionInput(deleteSavedViewSchema, input);
  const actor = await getActionActor();
  return deleteSavedViewFor(data, { actor, auditActorId: actor.id });
}
