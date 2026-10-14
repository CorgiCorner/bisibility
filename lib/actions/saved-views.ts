"use server";

import { deleteSavedViewSchema } from "@/lib/keywords/saved-view-model";
import { savedViewActionResult } from "@/lib/saved-views/action-result";
import {
  createSavedViewV2Schema,
  deleteSavedViewV2Schema,
  updateSavedViewV2Schema,
} from "@/lib/saved-views/canonical-model";
import { sessionSavedViewContext } from "@/lib/saved-views/context";
import { createProjectSavedViewSchema } from "@/lib/saved-views/model";
import { createSavedViewFor, deleteSavedViewFor } from "@/lib/saved-views/service";
import {
  createSavedViewV2For,
  deleteSavedViewV2For,
  updateSavedViewV2For,
} from "@/lib/saved-views/v2-service";
import { getActionActor, parseActionInput } from "./_shared";

export async function createSavedView(input: unknown) {
  const data = parseActionInput(createProjectSavedViewSchema, input);
  const actor = await getActionActor();
  return createSavedViewFor(data, sessionSavedViewContext(actor));
}

export async function deleteSavedView(input: unknown) {
  const data = parseActionInput(deleteSavedViewSchema, input);
  const actor = await getActionActor();
  return deleteSavedViewFor(data, sessionSavedViewContext(actor));
}

export async function createSavedViewV2(input: unknown) {
  return savedViewActionResult(async () => {
    const data = parseActionInput(createSavedViewV2Schema, input);
    return createSavedViewV2For(data, sessionSavedViewContext(await getActionActor()));
  });
}

export async function updateSavedViewV2(input: unknown) {
  return savedViewActionResult(async () => {
    const data = parseActionInput(updateSavedViewV2Schema, input);
    return updateSavedViewV2For(data, sessionSavedViewContext(await getActionActor()));
  });
}

export async function deleteSavedViewV2(input: unknown) {
  return savedViewActionResult(async () => {
    const data = parseActionInput(deleteSavedViewV2Schema, input);
    return deleteSavedViewV2For(data, sessionSavedViewContext(await getActionActor()));
  });
}
