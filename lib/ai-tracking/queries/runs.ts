import type { TrackingPageInput } from "@/lib/ai-tracking/contract";
import { prisma } from "@/lib/db/prisma";
import { trackingCursor, trackingPage } from "./cursor";
export async function listTrackingRuns(projectId: string, input: TrackingPageInput = {}) {
  const { limit, where } = trackingCursor(input);
  const rows = await prisma.aiTrackingRun.findMany({
    where: { projectId, ...where },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: { _count: { select: { samples: true } } },
  });
  return trackingPage(rows, limit);
}
