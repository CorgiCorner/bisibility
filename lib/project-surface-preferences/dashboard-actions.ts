"use server";
import { getActionActor } from "@/lib/actions/_shared";
import { recordAppAction } from "@/lib/activity/app-mutation";
import {
  BusinessLocationConflictError,
  BusinessLocationUnavailableError,
} from "@/lib/business-location-store/errors";
import { savedViewActionResult } from "@/lib/saved-views/action-result";
import { sessionSavedViewContext } from "@/lib/saved-views/context";
import { saveDashboardComparisonSelectionFor } from "./dashboard-comparison-store";
import {
  readDashboardPreferenceFor,
  saveDashboardLayoutFor,
  saveDashboardLocalSelectionFor,
  setDashboardDefaultFor,
} from "./dashboard-store";

export async function saveDashboardComparisonSelection(input: unknown) {
  return savedViewActionResult(async () => {
    const actor = await getActionActor();
    const value = await saveDashboardComparisonSelectionFor(input, sessionSavedViewContext(actor));
    recordAppAction(actor);
    return value;
  });
}

export async function readDashboardPreference(projectId: string) {
  return savedViewActionResult(async () =>
    readDashboardPreferenceFor(sessionSavedViewContext(await getActionActor()), projectId),
  );
}

export async function saveDashboardLayout(input: unknown) {
  return savedViewActionResult(async () => {
    const actor = await getActionActor();
    const value = await saveDashboardLayoutFor(input, sessionSavedViewContext(actor));
    recordAppAction(actor);
    return value;
  });
}
export async function setDashboardDefault(input: unknown) {
  return savedViewActionResult(async () => {
    const actor = await getActionActor();
    const value = await setDashboardDefaultFor(input, sessionSavedViewContext(actor));
    recordAppAction(actor);
    return value;
  });
}

export async function saveDashboardLocalSelection(input: unknown) {
  try {
    return await savedViewActionResult(async () => {
      const actor = await getActionActor();
      const value = await saveDashboardLocalSelectionFor(input, sessionSavedViewContext(actor));
      recordAppAction(actor);
      return value;
    });
  } catch (error) {
    if (
      error instanceof BusinessLocationConflictError ||
      error instanceof BusinessLocationUnavailableError
    )
      return {
        ok: false as const,
        error: {
          code: "conflict",
          status: 409,
          message: "Local selection is unavailable. Choose its current revision.",
        },
      };
    throw error;
  }
}
