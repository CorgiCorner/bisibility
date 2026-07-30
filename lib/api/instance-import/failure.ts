import "server-only";

export const CLOUD_IMPORT_FAILURE_DETAIL =
  "Cloud import could not be completed. Retry the transfer. If it fails again, contact your administrator.";

export function reportCloudImportFailure(
  error: unknown,
  context: { jobId: string; projectId: string },
) {
  console.error("[migration] cloud import failed", { error, ...context });
  return CLOUD_IMPORT_FAILURE_DETAIL;
}
