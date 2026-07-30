import "server-only";

import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { syncTrafficForProject } from "./sync";

export async function syncProjectTrafficNow(input: { actorId?: string | null; projectId: string }) {
  const project = await prisma.project.findFirst({
    select: { id: true, publicId: true },
    where: { OR: [{ id: input.projectId }, { publicId: input.projectId }] },
  });
  if (!project) throw new Error("Project not found.");
  const summary = await syncTrafficForProject(project.id, new Date());
  await writeAudit({
    action: "traffic.sync_now",
    actorId: input.actorId ?? null,
    after: {
      connections: summary.connections,
      keywordSnapshots: summary.keywordSnapshots,
      pageSnapshots: summary.pageSnapshots,
      skipped: summary.skipped.length,
    },
    projectId: project.id,
    targetId: project.publicId,
    targetType: "project",
  });
  return summary;
}
