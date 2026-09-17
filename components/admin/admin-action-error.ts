import { classifyActionError, type SharedErrorMessages } from "@/lib/ui/action-error";

/**
 * Admin actions deliberately expose only stable result codes. Shared deployment
 * recovery remains actionable, while unknown diagnostics stay out of toasts.
 */
export function presentAdminActionError(
  error: unknown,
  messages: SharedErrorMessages,
  fallback: string,
) {
  const classified = classifyActionError(error);
  if (classified.kind === "staleDeployment") return messages.staleDeployment();
  if (classified.kind === "serverComponentDigest") {
    return messages.serverComponentDigest({ digest: classified.digest });
  }
  return fallback;
}
