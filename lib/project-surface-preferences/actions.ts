"use server";
import { getActionActor } from "@/lib/actions/_shared";
import { recordAppAction } from "@/lib/activity/app-mutation";
import { savedViewActionResult } from "@/lib/saved-views/action-result";
import { sessionSavedViewContext } from "@/lib/saved-views/context";
import { savePersonalPresentationFor, setPersonalDefaultFor } from "./service";

export async function setPersonalDefault(input: unknown) {
  return savedViewActionResult(async () => {
    const actor = await getActionActor();
    const result = await setPersonalDefaultFor(
      input,
      sessionSavedViewContext(actor),
      undefined,
      () => recordAppAction(actor),
    );

    return result;
  });
}

export async function savePersonalPresentation(input: unknown) {
  return savedViewActionResult(async () => {
    const actor = await getActionActor();
    const result = await savePersonalPresentationFor(
      input,
      sessionSavedViewContext(actor),
      undefined,
      () => recordAppAction(actor),
    );

    return result;
  });
}
