import { type ActionResult, mapActionFailure } from "@/lib/actions/action-result";
import { z } from "zod";
import {
  PrivateViewCreationUnavailableError,
  SavedViewConflictError,
  SavedViewUnavailableError,
  ViewPreferenceConflictError,
} from "./errors";

/** Expected display failures survive the production Server Action transport without a digest. */
export async function savedViewActionResult<T>(run: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    if (error instanceof PrivateViewCreationUnavailableError)
      return {
        ok: false,
        error: { code: error.code, message: error.message, status: error.status },
      };
    if (error instanceof SavedViewConflictError || error instanceof ViewPreferenceConflictError)
      return { ok: false, error: { code: "conflict", message: error.message, status: 409 } };
    if (error instanceof SavedViewUnavailableError)
      return { ok: false, error: { code: "not_found", message: error.message, status: 404 } };
    if (error instanceof z.ZodError)
      return {
        ok: false,
        error: { code: "invalid_input", message: "Review the saved-view input.", status: 400 },
      };
    const known = mapActionFailure(error);
    if (known) return { ok: false, error: known };
    throw error;
  }
}
