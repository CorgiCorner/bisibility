import "server-only";
import { prisma } from "@/lib/db/prisma";
import { type BusinessProjectScope, businessProjectScope } from "./access";
import {
  readAssignmentHead,
  resolveAssignmentScope,
  storedAssignment,
} from "./assignment-repository";
import type { BusinessDatabase, BusinessStoreContext, BusinessTransaction } from "./context";
import { assignmentScopeSchema } from "./schema";

export async function readBusinessAssignmentFor(
  projectId: string,
  input: unknown,
  context: BusinessStoreContext,
  db: BusinessDatabase = prisma,
) {
  const selected = assignmentScopeSchema.parse(input);
  return db.$transaction(async (tx) => {
    const scope = await businessProjectScope(tx, context, projectId, "read", "business_assignment");
    const reference = await resolveAssignmentScope(tx, scope.project.id, selected);
    const current = await readAssignmentHead(
      tx,
      scope.project.id,
      reference.scopeType,
      reference.scopeId,
    );
    if (!current) return { current: null, history: [], targetAvailable: false };
    const history = await tx.businessAssignmentRevision.findMany({
      where: { projectId: scope.project.id, headId: current.head.id },
      orderBy: { revision: "asc" },
    });
    const target = current.current?.entityId
      ? await tx.businessLocation.findFirst({
          where: { projectId: scope.project.id, id: current.current.entityId },
          select: { state: true, role: true, currentRevisionId: true },
        })
      : null;
    const targetAvailable = Boolean(
      target &&
        target.state === "active" &&
        target.role === "subject" &&
        target.currentRevisionId === current.current?.identityRevisionId,
    );
    return {
      current: current.current ? storedAssignment(current.current) : null,
      history: history.map(storedAssignment),
      targetAvailable,
    };
  });
}

/** Shares the caller's authorized report snapshot, without opening a nested transaction. */
export async function readBusinessAssignmentInTransaction(
  tx: BusinessTransaction,
  scope: BusinessProjectScope,
  input: unknown,
  asOf: Date,
) {
  const selected = assignmentScopeSchema.parse(input);
  if (!Number.isFinite(asOf.getTime())) throw new Error("Invalid assignment watermark.");
  const reference = await resolveAssignmentScope(tx, scope.project.id, selected);
  const current = await readAssignmentHead(
    tx,
    scope.project.id,
    reference.scopeType,
    reference.scopeId,
  );
  if (!current?.current || current.current.effectiveFrom > asOf) return null;
  const target = current.current.entityId
    ? await tx.businessLocation.findFirst({
        where: { projectId: scope.project.id, id: current.current.entityId },
        select: { state: true, role: true, currentRevisionId: true },
      })
    : null;
  return {
    reference,
    head: current.head,
    assignment: storedAssignment(current.current),
    targetAvailable: Boolean(
      target &&
        target.state === "active" &&
        target.role === "subject" &&
        target.currentRevisionId === current.current.identityRevisionId,
    ),
  };
}
