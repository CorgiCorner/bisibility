import "server-only";

import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";

export async function readProjectSettingsSnapshot(projectId: string) {
  return prisma.project.findUnique({
    select: { domain: true, name: true, publicId: true, trackingScope: true },
    where: { id: projectId },
  });
}

export async function updateProjectSettingsSnapshot(projectId: string, data: { name: string }) {
  return prisma.project.update({
    data: { name: data.name },
    select: { domain: true, name: true, publicId: true, trackingScope: true },
    where: { id: projectId },
  });
}

export async function readProjectDeleteSnapshot(projectId: string) {
  return prisma.project.findUnique({
    select: {
      _count: {
        select: { apiKeys: true, keywords: true, members: true, providerConnections: true },
      },
      domain: true,
      name: true,
      publicId: true,
    },
    where: { id: projectId },
  });
}

export async function deleteProjectById(
  projectId: string,
  audit: {
    actorId: string;
    before: NonNullable<Awaited<ReturnType<typeof readProjectDeleteSnapshot>>>;
    targetId: string;
  },
) {
  return prisma.$transaction(async (tx) => {
    await writeAudit(
      {
        action: "project.delete",
        actorId: audit.actorId,
        before: audit.before,
        projectId,
        targetId: audit.targetId,
        targetType: "project",
      },
      tx,
    );
    return tx.project.delete({ where: { id: projectId } });
  });
}

export async function readActorProjects(actorId: string) {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, publicId: true },
    where: { members: { some: { userId: actorId } } },
  });

  return projects;
}
