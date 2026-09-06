import "server-only";

import { prisma } from "@/lib/db/prisma";
import { normalizeExperimentalModules } from "@/lib/settings/experimental-modules";
import { requireReadableProject } from "./_auth";

export async function getExperimentalModules(projectRef: string) {
  const { project } = await requireReadableProject(projectRef);
  const defaults = await prisma.projectDefaults.findUnique({
    select: { enabledExperimentalModules: true },
    where: { projectId: project.id },
  });
  return normalizeExperimentalModules(defaults?.enabledExperimentalModules);
}
