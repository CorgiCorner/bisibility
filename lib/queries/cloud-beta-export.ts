import "server-only";

import { prisma } from "@/lib/db/prisma";
import { requireReadableProject } from "./_auth";

export type CloudPackageExportSummary = {
  exportedAt: string;
};

export async function getLatestCloudPackageExport(
  projectId: string,
): Promise<CloudPackageExportSummary | null> {
  const { project } = await requireReadableProject(projectId);
  const row = await prisma.auditLog.findFirst({
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
    where: {
      action: "cloud_import.export_package",
      projectId: project.id,
      status: "success",
    },
  });

  return row ? { exportedAt: row.createdAt.toISOString() } : null;
}
