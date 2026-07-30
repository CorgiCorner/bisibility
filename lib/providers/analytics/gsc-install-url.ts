import { googleInstallUrl } from "./google-install-url";

/**
 * Preserve wizard context through OAuth with a return path validated as app-relative.
 */
export function gscInstallUrl(projectId: string, returnPath?: string) {
  return googleInstallUrl({
    projectId,
    provider: "gsc",
    returnPath: returnPath ?? `/onboarding?step=5&projectId=${projectId}`,
  });
}
