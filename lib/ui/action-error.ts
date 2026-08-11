export const STALE_DEPLOYMENT_MESSAGE =
  "bisibility was updated while this page was open. Refresh the app to continue. Any unsaved changes will be lost.";

const stalePatterns = [
  /failed to find server action/i,
  /server action .* was not found on the server/i,
  /older or newer deployment/i,
];

const nextDigestMessagePatterns = [
  /Server Components render/i,
  /An unexpected response was received from the server/i,
];

export function isStaleDeploymentError(error: unknown) {
  return error instanceof Error && stalePatterns.some((pattern) => pattern.test(error.message));
}

function serverComponentDigest(error: Error) {
  if (!nextDigestMessagePatterns.some((pattern) => pattern.test(error.message))) return null;
  const digest = (error as Error & { digest?: unknown }).digest;
  return typeof digest === "string" && digest.length > 0 ? digest : null;
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
  const digest = serverComponentDigest(error);
  if (digest) {
    return `Check failed on our side (ref ${digest}). Retry in a moment.`;
  }
  return error.message || fallback;
}
