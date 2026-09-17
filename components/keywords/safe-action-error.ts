import type { SharedErrorMessages } from "@/lib/ui/action-error";
import { classifyActionError, presentActionError } from "@/lib/ui/action-error";

/** Keeps feature UI localized while preserving stale-deployment and digest recovery. */
export function presentSafeActionError(
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
