import type { TrackingPageInput } from "@/lib/ai-tracking/contract";
import { prisma } from "@/lib/db/prisma";
import { trackingCursor, trackingPage } from "./cursor";
export async function listTrackingSamples(
  projectId: string,
  runId: string,
  input: TrackingPageInput = {},
) {
  const { limit, where } = trackingCursor(input);
  const rows = await prisma.aiTrackingSample.findMany({
    where: { projectId, runId, ...where },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: { citations: true, observations: true, promptRevision: true },
  });
  return trackingPage(rows, limit);
}
