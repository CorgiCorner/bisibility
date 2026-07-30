import { prisma } from "@/lib/db/prisma";
import { projectDefaultSerpMarket } from "@/lib/serp/default-market";

export async function keywordImportDefaults(projectId: string) {
  const project = await prisma.project.findUnique({
    select: {
      defaults: true,
      keywords: { select: { device: true, location: true, locationRef: true } },
    },
    where: { id: projectId },
  });
  return projectDefaultSerpMarket(project?.defaults, project?.keywords ?? []);
}
