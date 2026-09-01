import "server-only";

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { asProjectRef, searchConsolePath } from "@/lib/routing/app-path";
import { propertyDisplayName } from "@/lib/search-insights/queries/context-model";
import { readImportObservability } from "@/lib/search-insights/queries/import-observability-db";

export type SearchImportMilestone = "first_data" | "first_28" | "full";

export async function deliverSearchImportMilestone(input: {
  importId: string;
  milestone: SearchImportMilestone;
}) {
  const imported = await prisma.searchAnalyticsImport.findUnique({
    include: { project: { include: { members: true } } },
    where: { id: input.importId },
  });
  if (imported?.source !== "gsc") return { delivered: 0 };
  type ImportWithFirstData = typeof imported & {
    firstDataDate?: Date | null;
    firstDataDetectedAt?: Date | null;
    waitingForFirstDataAt?: Date | null;
  };
  const importWithFirstData: ImportWithFirstData = imported;
  const eligible =
    input.milestone === "first_data"
      ? Boolean(
          importWithFirstData.firstDataDetectedAt &&
            importWithFirstData.firstDataDate &&
            importWithFirstData.waitingForFirstDataAt,
        )
      : input.milestone === "first_28"
        ? (
            await readImportObservability({
              daysTotal: imported.daysTotal,
              earliestTargetDate: imported.earliestTargetDate,
              newestFinalizedDate: imported.newestFinalizedDate,
              projectId: imported.projectId,
              property: imported.property,
            })
          ).readyThrough.d28.current
        : imported.state === "completed";
  if (!eligible) return { delivered: 0 };
  const property = propertyDisplayName(imported.property);
  const title =
    input.milestone === "first_data"
      ? `Your site appeared in Google search - first data imported for ${property}.`
      : input.milestone === "first_28"
        ? `Search Console data is in: your first 28 days of ${property} are ready.`
        : `Full history imported: ${imported.plannedRetentionMonths ?? 16} months of ${property}, kept from now on.`;
  const recipients = new Set([
    imported.project.ownerId,
    ...imported.project.members.map((member) => member.userId),
  ]);
  const idempotencyKey = `search-import:${imported.id}:${input.milestone}`;
  const result = await prisma.notification.createMany({
    data: [...recipients].map((userId) => ({
      idempotencyKey,
      payload: { href: searchConsolePath(asProjectRef(imported.project.publicId)) },
      projectId: imported.projectId,
      publicId: `ntf_${randomUUID().replaceAll("-", "")}`,
      title,
      type: "import_done" as const,
      userId,
    })),
    skipDuplicates: true,
  });
  return { delivered: result.count };
}
