import "server-only";
import { prisma } from "@/lib/db/prisma";
import { parseComparisonSnapshot } from "./model";
import type { PlaygroundSource } from "./playground-model";
import { comparisonRunView } from "./read";
/** A cache hit must retain every selected provider for the exact request scope. */
export async function readPlaygroundCache(projectId: string, input: PlaygroundSource) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { domain: true },
  });
  if (!project) return null;
  const rows = await prisma.providerComparisonRun.findMany({
    where: { projectId, keywordId: null },
    include: { sides: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  for (const row of rows) {
    const snapshot = parseComparisonSnapshot(row.snapshot);
    if (
      snapshot.version !== 2 ||
      snapshot.domain !== project.domain ||
      snapshot.text !== input.query ||
      snapshot.locationId !== input.locationId ||
      snapshot.device !== input.device ||
      (snapshot.depth ?? 20) !== (input.depth ?? 20) ||
      snapshot.connections.length !== input.providers.length ||
      !snapshot.connections.every((side) => input.providers.includes(side.provider))
    )
      continue;
    if (row.sides.some((side) => side.status !== "completed" || !side.result)) continue;
    return comparisonRunView(row);
  }
  return null;
}
