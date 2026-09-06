"use server";

import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateExperimentalModuleViews,
} from "@/lib/actions/_shared";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import {
  experimentalModulesSchema,
  normalizeExperimentalModules,
} from "@/lib/settings/experimental-modules";

export async function setExperimentalModules(input: unknown) {
  const data = parseActionInput(experimentalModulesSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, {
    type: "project_defaults",
  });
  const enabledExperimentalModules = normalizeExperimentalModules(data.enabledExperimentalModules);
  const before = await prisma.projectDefaults.findUnique({
    select: { enabledExperimentalModules: true },
    where: { projectId: project.id },
  });
  const updated = await prisma.projectDefaults.upsert({
    create: { enabledExperimentalModules, projectId: project.id },
    select: { enabledExperimentalModules: true },
    update: { enabledExperimentalModules },
    where: { projectId: project.id },
  });
  const beforeEnabledExperimentalModules = normalizeExperimentalModules(
    before?.enabledExperimentalModules,
  );
  const afterEnabledExperimentalModules = normalizeExperimentalModules(
    updated.enabledExperimentalModules,
  );

  await writeAudit({
    action: "settings.experimental_modules.update",
    actorId: actor.id,
    after: { enabledExperimentalModules: afterEnabledExperimentalModules },
    before: { enabledExperimentalModules: beforeEnabledExperimentalModules },
    projectId: project.id,
    targetId: project.publicId,
    targetType: "project_defaults",
  });
  revalidateExperimentalModuleViews();

  return { enabledExperimentalModules: afterEnabledExperimentalModules };
}
