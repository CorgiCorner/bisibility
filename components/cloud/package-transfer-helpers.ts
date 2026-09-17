import { migrationCompletionFromResponse } from "@/lib/migration/result";
import type { useTranslations } from "next-intl";
import type { CloudImportPackageFile } from "./cloud-token";

type PackageTranslator = ReturnType<typeof useTranslations<"projectSettingsMigration.package">>;

export function packageCountSummary(file: CloudImportPackageFile, t: PackageTranslator) {
  const counts = file.counts;
  return t("counts", counts);
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
