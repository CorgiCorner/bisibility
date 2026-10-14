import "server-only";
import type { BusinessAssignmentRevision } from "@/lib/generated/prisma/client";
import type { BusinessTransaction } from "./context";
import { BusinessLocationUnavailableError } from "./errors";

export type AssignmentScopeInput = Readonly<{ kind: "keyword" | "market"; id: string }>;
export async function resolveAssignmentScope(
  tx: BusinessTransaction,
  projectId: string,
  scope: AssignmentScopeInput,
) {
  const row =
    scope.kind === "keyword"
      ? await tx.keyword.findFirst({
          where: { projectId, publicId: scope.id },
          select: { id: true },
        })
      : await tx.projectMarket.findFirst({
          where: { projectId, publicId: scope.id },
          select: { id: true },
        });
  if (!row) throw new BusinessLocationUnavailableError();
  return {
    scopeType: scope.kind,
    scopeId: row.id,
    keywordId: scope.kind === "keyword" ? row.id : null,
    marketId: scope.kind === "market" ? row.id : null,
  };
}
export function storedAssignment(row: BusinessAssignmentRevision) {
  return { ...row, effectiveFrom: row.effectiveFrom.toISOString() };
}
export async function readAssignmentHead(
  tx: BusinessTransaction,
  projectId: string,
  scopeType: string,
  scopeId: string,
) {
  const head = await tx.businessAssignmentHead.findFirst({
    where: { projectId, scopeType, scopeId },
  });
  if (!head) return null;
  const current = head.currentRevisionId
    ? await tx.businessAssignmentRevision.findFirst({
        where: { projectId, headId: head.id, id: head.currentRevisionId },
      })
    : null;
  if ((head.version > 0 && !current) || (current && current.revision !== head.version))
    throw new BusinessLocationUnavailableError();
  return { head, current };
}
