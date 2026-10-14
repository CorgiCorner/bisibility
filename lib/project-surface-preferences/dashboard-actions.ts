"use server";

import { getActionActor } from "@/lib/actions/_shared";
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
  return savedViewActionResult(async () =>
    saveDashboardComparisonSelectionFor(input, sessionSavedViewContext(await getActionActor())),
  );
}

export async function readDashboardPreference(projectId: string) {
  return savedViewActionResult(async () =>
    readDashboardPreferenceFor(sessionSavedViewContext(await getActionActor()), projectId),
  );
}

export async function saveDashboardLayout(input: unknown) {
  return savedViewActionResult(async () =>
    saveDashboardLayoutFor(input, sessionSavedViewContext(await getActionActor())),
  );
}
export async function setDashboardDefault(input: unknown) {
  return savedViewActionResult(async () =>
    setDashboardDefaultFor(input, sessionSavedViewContext(await getActionActor())),
  );
}

export async function saveDashboardLocalSelection(input: unknown) {
  try {
    return await savedViewActionResult(async () =>
      saveDashboardLocalSelectionFor(input, sessionSavedViewContext(await getActionActor())),
    );
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
