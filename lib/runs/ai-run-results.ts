import "server-only";
import { getActionActor } from "@/lib/actions/_shared";
import { trackingSampleProjection } from "@/lib/ai-tracking/projections/evidence";
import { listTrackingSamples } from "@/lib/ai-tracking/queries/samples";
import { trackingScope } from "@/lib/api/ai-tracking-service";
import { prisma } from "@/lib/db/prisma";
import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { aiProjectRun, aiRunSelect } from "./ai-project-run";
import { aiRunSummaries } from "./ai-run-summary";

/** The same project/feature authorization as AI Tracking; this path performs reads only. */
export async function loadAiRunResults(projectRef: string, publicId: string, cursor?: string) {
  const actor = await getActionActor();
  const project = await trackingScope(actor, projectRef);
  if (!isPublicIdOfType(publicId, "air")) return null;
  const record = await prisma.aiTrackingRun.findFirst({
    where: { projectId: project.id, publicId },
    select: aiRunSelect,
  });
  if (!record) return null;
  const [page, summaries, displayProject] = await Promise.all([
    listTrackingSamples(project.id, record.id, { limit: 20, cursor }),
    aiRunSummaries(project.id, [record.id]),
    prisma.project.findUnique({ where: { id: project.id }, select: { name: true } }),
  ]);
  if (!displayProject) return null;
  return {
    run: aiProjectRun(record, { ...project, name: displayProject.name }, summaries[0]),
    samples: page.items.map(trackingSampleProjection),
    nextCursor: page.nextCursor,
  };
}
