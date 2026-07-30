import type { CloudImportPackageFile } from "@/components/cloud/cloud-token";
import { buildCloudWorkspacePackage } from "@/lib/migration/workspace-package";
import { downloadBlob } from "@/lib/ui/download";

export async function downloadWorkspacePackage(file: CloudImportPackageFile) {
  const bytes = await buildCloudWorkspacePackage(file.content);
  const filename = file.filename.replace(/\.json$/i, ".zip");
  downloadBlob(new Blob([bytes], { type: "application/zip" }), filename);
  return filename;
}
