export const STALE_DEPLOYMENT_MESSAGE =
  "Bisibility was updated while this page was open. Refresh the app to continue. Any unsaved changes will be lost.";

const stalePatterns = [
  /failed to find server action/i,
  /server action .* was not found on the server/i,
  /older or newer deployment/i,
];

export function isStaleDeploymentError(error: unknown) {
  return error instanceof Error && stalePatterns.some((pattern) => pattern.test(error.message));
}

export function actionErrorMessage(
  error: unknown,
  fallback = "The action could not be completed.",
) {
  if (!(error instanceof Error)) {
    return fallback;
  }
  if (isStaleDeploymentError(error)) {
    return STALE_DEPLOYMENT_MESSAGE;
  }
  return error.message || fallback;
}
