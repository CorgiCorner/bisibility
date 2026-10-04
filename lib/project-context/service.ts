import "server-only";

import { prisma } from "@/lib/db/prisma";
import { assertProjectWritable } from "@/lib/deployment/project-write-mode";
import { emptyProjectContext, type ProjectContextResource, projectContextSchema } from "./model";

export async function getProjectContext(projectId: string): Promise<ProjectContextResource> {
  const row = await prisma.projectContext.findUnique({ where: { projectId } });
  if (!row) return { ...emptyProjectContext };
  return {
    ...projectContextSchema.parse({
      business: row.business,
      audience: row.audience,
      products: row.products,
      goals: row.goals,
      agentRules: row.agentRules,
    }),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function saveProjectContext(projectId: string, input: unknown) {
  const data = projectContextSchema.parse(input);
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { id: true, writeMode: true },
  });
  assertProjectWritable(project);
  const row = await prisma.projectContext.upsert({
    where: { projectId },
    create: { ...data, projectId },
    update: data,
  });
  return { ...data, updatedAt: row.updatedAt.toISOString() };
}
