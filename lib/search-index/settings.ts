import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { isSelfHost } from "@/lib/deployment/deployment";
import {
  availableInspectionModes,
  effectiveInspectionMode,
  validateInspectionMode,
} from "@/lib/presence/budget-mode";
import { DEFAULT_INSPECTION_DAILY_LIMIT } from "@/lib/presence/constants";
import { propertyQuotaKey, readPropertyQuota } from "@/lib/presence/property-quota";
import { pageIndexingSettingsPatchSchema } from "./report-schema";
import { connectionForProject } from "./service";

export async function getPageIndexingSettings(projectId: string, now = new Date()) {
  return settingsForConnection(projectId, await connectionForProject(projectId), now);
}

async function settingsForConnection(
  projectId: string,
  selected: Awaited<ReturnType<typeof connectionForProject>>,
  now = new Date(),
) {
  const defaults = await prisma.projectDefaults.findUnique({ where: { projectId } });
  return {
    property: selected.property,
    budgetMode: effectiveInspectionMode(defaults?.inspectionBudgetMode, isSelfHost),
    inspectionDailyLimit: defaults?.inspectionDailyLimit ?? DEFAULT_INSPECTION_DAILY_LIMIT,
    availableModes: availableInspectionModes(isSelfHost),
    ...(await readPropertyQuota(propertyQuotaKey(selected.property), now)),
  };
}

export async function updatePageIndexingSettings(
  projectId: string,
  body: unknown,
  actorId: string | null,
) {
  const input = pageIndexingSettingsPatchSchema.parse(body);
  validateInspectionMode(input.budget_mode, isSelfHost);
  const selected = await connectionForProject(projectId);
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { publicId: true },
  });
  const data = {
    ...(input.budget_mode === undefined ? {} : { inspectionBudgetMode: input.budget_mode }),
    ...(input.inspection_daily_limit === undefined
      ? {}
      : { inspectionDailyLimit: input.inspection_daily_limit }),
  };
  await prisma.$transaction(async (tx) => {
    const before = await tx.projectDefaults.findUnique({ where: { projectId } });
    const after = await tx.projectDefaults.upsert({
      where: { projectId },
      create: { ...data, projectId },
      update: data,
    });
    await writeAudit(
      {
        action: "settings.presence_inspection_budget.update",
        actorId,
        projectId,
        targetId: project.publicId,
        targetType: "project_defaults",
        before: before
          ? {
              inspectionDailyLimit: before.inspectionDailyLimit,
              inspectionBudgetMode: before.inspectionBudgetMode,
            }
          : null,
        after: {
          inspectionDailyLimit: after.inspectionDailyLimit,
          inspectionBudgetMode: after.inspectionBudgetMode,
        },
      },
      tx,
    );
  });
  return settingsForConnection(projectId, selected);
}
