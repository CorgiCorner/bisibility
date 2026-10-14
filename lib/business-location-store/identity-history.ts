import "server-only";
import type { IdentityHistorySummary } from "@/lib/business-locations/ui-contracts";
import { identitySummary } from "@/lib/business-locations/ui-projection";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";
import { businessProjectScope } from "./access";
import type { BusinessDatabase, BusinessStoreContext } from "./context";
import { loadBusinessLocation, storedIdentity } from "./location-repository";

export async function readBusinessIdentityHistory(
  projectId: string,
  locationId: string,
  after: unknown,
  context: BusinessStoreContext,
  db: BusinessDatabase = prisma,
) {
  const revision = z.number().int().nonnegative().max(2_147_483_647).parse(after);
  return db.$transaction(async (tx) => {
    const scope = await businessProjectScope(tx, context, projectId, "read");
    const { row } = await loadBusinessLocation(tx, scope.project.id, locationId);
    const history = await tx.businessIdentityRevision.findMany({
      where: { projectId: scope.project.id, entityId: row.id, revision: { gt: revision } },
      take: 51,
      orderBy: { revision: "asc" },
    });
    const rows: IdentityHistorySummary[] = history.slice(0, 50).map((stored) => {
      const item = storedIdentity(stored);
      return {
        identity: identitySummary(item),
        effectiveFrom: item.effectiveFrom,
        reason: item.reason,
      };
    });
    return { rows, next: history.length > 50 ? history[49].revision : null };
  });
}
