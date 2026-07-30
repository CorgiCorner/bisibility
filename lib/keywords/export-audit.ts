import "server-only";

import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";

export function auditCloudPackageExport(
  actorId: string,
  projectId: string,
  projectPublicId: string,
  count: number,
) {
  return writeAudit({
    action: "cloud_import.export_package",
    actorId,
    after: { count },
    projectId,
    targetId: requiredPublicAuditId(projectPublicId, "prj", "Project"),
    targetType: "project",
  });
}

export function auditKeywordExport(
  actorId: string | null,
  projectId: string,
  projectPublicId: string,
  count: number,
  format: "csv" | "json" | "xlsx",
  scope: "current" | "history",
) {
  return writeAudit({
    action: `keyword.${format}_export`,
    actorId,
    after: { count, format, scope },
    projectId,
    targetId: requiredPublicAuditId(projectPublicId, "prj", "Project"),
    targetType: "project",
  });
}
