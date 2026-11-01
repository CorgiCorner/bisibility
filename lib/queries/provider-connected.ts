import "server-only";
import { prisma } from "@/lib/db/prisma";
import { requireReadableProject } from "./_auth";

export async function isProviderConnected(projectId: string, provider: string) {
  const { project } = await requireReadableProject(projectId);
  const connection = await prisma.providerConnection.findUnique({
    select: { enabled: true, status: true },
    where: { projectId_provider: { projectId: project.id, provider } },
  });
  return Boolean(connection?.enabled && connection.status === "connected");
}
