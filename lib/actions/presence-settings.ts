"use server";

import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { projectInspectionBudgetSchema } from "@/lib/schemas/project";
import {
  projectDefaultsConfig,
  publicProjectDefaults,
} from "@/lib/settings/project-defaults-config";
import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateSettingsViews,
} from "./_shared";

export async function updatePresenceInspectionBudget(input: unknown) {
  const data = parseActionInput(projectInspectionBudgetSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, {
    type: "project_defaults",
  });
  const before = await prisma.projectDefaults.findUnique({
    where: { projectId: project.id },
  });
  const defaults = await prisma.projectDefaults.upsert({
    create: { inspectionDailyLimit: data.inspectionDailyLimit, projectId: project.id },
    update: { inspectionDailyLimit: data.inspectionDailyLimit },
    where: { projectId: project.id },
  });

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
  return publicProjectDefaults(defaults, project.publicId);
}
