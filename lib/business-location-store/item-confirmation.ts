import "server-only";
import type { BusinessTransaction } from "./context";
import { BusinessLocationConflictError, BusinessLocationUnavailableError } from "./errors";
import { storedMatch } from "./match-repository";

/** The caller holds the project mutation lock in READ COMMITTED before this bounded read. */
export async function assertItemConfirmationAvailable(
  tx: BusinessTransaction,
  scope: { projectId: string; entityId: string; observationRunId: string; itemId: string },
) {
  const heads = await tx.businessMatchHead.findMany({
    where: {
      projectId: scope.projectId,
      observationRunId: scope.observationRunId,
      itemId: scope.itemId,
      entityId: { not: scope.entityId },
    },
    orderBy: { id: "asc" },
    take: 1001,
  });
  if (heads.length > 1000) throw new BusinessLocationUnavailableError();
  const rows = await tx.businessMatchDecision.findMany({
    where: {
      projectId: scope.projectId,
      observationRunId: scope.observationRunId,
      itemId: scope.itemId,
      id: { in: heads.flatMap((head) => (head.currentDecisionId ? [head.currentDecisionId] : [])) },
    },
    take: 1001,
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const head of heads) {
    const row = head.currentDecisionId ? byId.get(head.currentDecisionId) : null;
    if (
      (head.version > 0 && !row) ||
      (row &&
        (row.headId !== head.id ||
          row.entityId !== head.entityId ||
          row.decisionRevision !== head.version ||
          row.itemId !== head.itemId ||
          row.observationRunId !== head.observationRunId))
    )
      throw new BusinessLocationUnavailableError();
    // A historical confirmation superseded by rejection/rematch is not a claim.
    // Archiving an entity does not silently revoke its retained current decision.
    if (row && storedMatch(row).status === "confirmed")
      throw new BusinessLocationConflictError("state_conflict");
  }
}
