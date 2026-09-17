import {
  classifyActionError,
  presentActionError,
  type SharedErrorMessages,
} from "@/lib/ui/action-error";

/** Keeps unknown action details out of the shared bulk-action surface. */
export function presentBulkActionError(
  error: unknown,
  sharedErrors: SharedErrorMessages,
  fallback: string,
) {
  const classified = classifyActionError(error);
  if (classified.kind === "staleDeployment" || classified.kind === "serverComponentDigest") {
    return presentActionError(error, sharedErrors, fallback);
  }
  return fallback;
}
