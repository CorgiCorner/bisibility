"use server";
import { recordAppAction } from "@/lib/activity/app-mutation";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { validateInspectionMode } from "@/lib/presence/budget-mode";
import { projectInspectionBudgetSchema } from "@/lib/schemas/project";
import {
  projectDefaultsConfig,
  publicProjectDefaults,
} from "@/lib/settings/project-defaults-config";
import { saveSearchSyncSettings } from "@/lib/settings/search-sync-save";
import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateSettingsViews,
} from "./_shared";

export async function updatePresenceInspectionBudget(input: unknown) {
  const data = parseActionInput(projectInspectionBudgetSchema, input);
  validateInspectionMode(data.inspectionBudgetMode);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, {
    type: "project_defaults",
  });
  const before = await prisma.projectDefaults.findUnique({
    where: { projectId: project.id },
  });
  const defaults = await prisma.projectDefaults.upsert({
    create: {
      inspectionDailyLimit: data.inspectionDailyLimit,
      inspectionBudgetMode: data.inspectionBudgetMode,
      projectId: project.id,
    },
    update: {
      inspectionDailyLimit: data.inspectionDailyLimit,
      inspectionBudgetMode: data.inspectionBudgetMode,
    },
    where: { projectId: project.id },
  });

  recordAppAction(actor);
  await writeAudit({
    action: "settings.presence_inspection_budget.update",
    actorId: actor.id,
    after: projectDefaultsConfig(defaults),
    before: before ? projectDefaultsConfig(before) : null,
    projectId: project.id,
    targetId: requiredPublicAuditId(project.publicId, "prj", "Project"),
    targetType: "project_defaults",
  });
  revalidateSettingsViews();
  const actionResult = await publicProjectDefaults(defaults, project.publicId);

  return actionResult;
}

export async function updateSearchSyncSettings(input: unknown) {
  const result = await saveSearchSyncSettings(input, (actor) => recordAppAction(actor));
  return result.value;
}
