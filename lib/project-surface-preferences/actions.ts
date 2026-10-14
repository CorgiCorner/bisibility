"use server";

import { getActionActor } from "@/lib/actions/_shared";
import { savedViewActionResult } from "@/lib/saved-views/action-result";
import { sessionSavedViewContext } from "@/lib/saved-views/context";
import { savePersonalPresentationFor, setPersonalDefaultFor } from "./service";

export async function setPersonalDefault(input: unknown) {
  return savedViewActionResult(async () =>
    setPersonalDefaultFor(input, sessionSavedViewContext(await getActionActor())),
  );
}

export async function savePersonalPresentation(input: unknown) {
  return savedViewActionResult(async () =>
    savePersonalPresentationFor(input, sessionSavedViewContext(await getActionActor())),
  );
}
