"use server";
import { recordAppAction } from "@/lib/activity/app-mutation";
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
  const actionResult = await createSavedViewFor(
    data,
    sessionSavedViewContext(actor),
    undefined,
    () => recordAppAction(actor),
  );

  return actionResult;
}

export async function deleteSavedView(input: unknown) {
  const data = parseActionInput(deleteSavedViewSchema, input);
  const actor = await getActionActor();
  const actionResult = await deleteSavedViewFor(
    data,
    sessionSavedViewContext(actor),
    undefined,
    () => recordAppAction(actor),
  );

  return actionResult;
}

export async function createSavedViewV2(input: unknown) {
  return savedViewActionResult(async () => {
    const data = parseActionInput(createSavedViewV2Schema, input);
    const actor = await getActionActor();
    const result = await createSavedViewV2For(data, sessionSavedViewContext(actor), undefined, () =>
      recordAppAction(actor),
    );
    return result;
  });
}

export async function updateSavedViewV2(input: unknown) {
  return savedViewActionResult(async () => {
    const data = parseActionInput(updateSavedViewV2Schema, input);
    const actor = await getActionActor();
    const result = await updateSavedViewV2For(data, sessionSavedViewContext(actor), undefined, () =>
      recordAppAction(actor),
    );

    return result;
  });
}

export async function deleteSavedViewV2(input: unknown) {
  return savedViewActionResult(async () => {
    const data = parseActionInput(deleteSavedViewV2Schema, input);
    const actor = await getActionActor();
    const result = await deleteSavedViewV2For(data, sessionSavedViewContext(actor), undefined, () =>
      recordAppAction(actor),
    );

    return result;
  });
}
