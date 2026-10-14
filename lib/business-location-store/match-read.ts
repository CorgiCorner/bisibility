import "server-only";
import { prisma } from "@/lib/db/prisma";
import { businessProjectScope } from "./access";
import type { BusinessDatabase, BusinessStoreContext } from "./context";
import { BusinessLocationUnavailableError } from "./errors";
import { loadBusinessLocation } from "./location-repository";
import { storedMatch } from "./match-repository";

export async function readBusinessMatchesFor(
  projectId: string,
  locationId: string,
  observationRunId: string,
  context: BusinessStoreContext,
  db: BusinessDatabase = prisma,
) {
  return db.$transaction(async (tx) => {
    const scope = await businessProjectScope(tx, context, projectId, "read", "entity_match");
    const { row } = await loadBusinessLocation(tx, scope.project.id, locationId);
    const run = await tx.observationRun.findFirst({
      where: { projectId: scope.project.id, id: observationRunId },
      select: { id: true, surface: true },
    });
    if (!run) throw new BusinessLocationUnavailableError();
    const decisions = await tx.businessMatchDecision.findMany({
      where: { projectId: scope.project.id, entityId: row.id, observationRunId },
      orderBy: [{ itemId: "asc" }, { decisionRevision: "asc" }],
    });
    const items = await tx.observationItem.findMany({
      where: { observationRunId: run.id },
      select: { id: true, businessName: true, domain: true },
    });
    return { decisions: decisions.map(storedMatch), surface: run.surface, items };
  });
}
