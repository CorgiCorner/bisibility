import { migrationCompletionFromResponse } from "@/lib/migration/result";
import type { CloudImportPackageFile } from "./cloud-token";

export function packageCountSummary(file: CloudImportPackageFile) {
  const counts = file.counts;
  return [
    `${counts.keywords} keywords`,
    `${counts.rankChecks} rank checks`,
    `${counts.alertRules} alert rules`,
    `${counts.competitors} competitors`,
    `${counts.notificationPreferences} notification preferences`,
    `${counts.savedViews} saved views`,
  ].join(" / ");
}

export async function postImportPackage(rawToken: string, parsed: unknown) {
  const response = await fetch("/api/v1/cloud/import", {
    body: JSON.stringify(parsed),
    headers: {
      Authorization: `Bearer ${rawToken}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const detail = body && typeof body === "object" && "detail" in body ? body.detail : undefined;
    throw new Error(typeof detail === "string" ? detail : "Import failed.");
  }
  return migrationCompletionFromResponse(body);
}
