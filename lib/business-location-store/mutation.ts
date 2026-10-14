import "server-only";
import { writeAudit } from "@/lib/auth/audit";
import type { ResourceType } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { type BusinessProjectScope, businessProjectScope } from "./access";
import { businessDigest } from "./canonical";
import type { BusinessDatabase, BusinessStoreContext, BusinessTransaction } from "./context";
import { BusinessLocationConflictError } from "./errors";
import { type BusinessMutationReceipt, mutationReceiptSchema } from "./schema";

export type BusinessAudit = Readonly<{
  action:
    | "business_location.create"
    | "business_location.revise"
    | "business_location.archive"
    | "business_location.restore"
    | "entity_match.rematch"
    | "entity_match.confirm"
    | "entity_match.reject"
    | "business_assignment.assign"
    | "business_assignment.unassign";
  targetType: "business_location" | "entity_match" | "business_assignment";
  targetId: string;
  after: Readonly<{
    operation: string;
    state?: string;
    revisionId?: string;
    previousId?: string | null;
    version?: number;
    revision?: number;
    decisionRevision?: number;
    changedCount?: number;
  }>;
}>;
export async function mutateBusiness<
  T extends { projectId: string; idempotencyKey: string },
>(input: {
  data: T;
  context: BusinessStoreContext;
  operation: string;
  resource?: ResourceType;
  action?: "create" | "update";
  db?: BusinessDatabase;
  /** Trusted server-only retained-evidence guard, also checked before idempotent return. */
  assertReplay?: (tx: BusinessTransaction, scope: BusinessProjectScope) => Promise<void>;
  retainedEvidence?: unknown;
  execute: (
    tx: BusinessTransaction,
    scope: BusinessProjectScope,
    now: Date,
  ) => Promise<{ receipt: BusinessMutationReceipt; audit: BusinessAudit }>;
}) {
  const data = structuredClone(input.data);
  // Project-row serialization must observe the preceding writer after its lock wait.
  // Do not inherit a deployment REPEATABLE READ snapshot taken before that lock.
  return (input.db ?? prisma).$transaction(
    async (tx) => {
      const scope = await businessProjectScope(
        tx,
        input.context,
        data.projectId,
        input.action ?? "update",
        input.resource,
      );
      await input.assertReplay?.(tx, scope);
      const keyHash = businessDigest([data.idempotencyKey]);
      const bodyHash = businessDigest([
        scope.actor.id,
        input.operation,
        { ...data, idempotencyKey: undefined },
        ...(input.retainedEvidence === undefined ? [] : [input.retainedEvidence]),
      ]);
      const where = { projectId: scope.project.id, operation: input.operation, keyHash };
      const retained = await tx.businessLocationMutation.findFirst({ where });
      if (retained) {
        if (retained.actorId !== scope.actor.id || retained.bodyHash !== bodyHash)
          throw new BusinessLocationConflictError("idempotency_conflict");
        return { receipt: mutationReceiptSchema.parse(retained.result), replayed: true };
      }
      const result = await input.execute(tx, scope, new Date());
      const receipt = mutationReceiptSchema.parse(result.receipt);
      await writeAudit(
        {
          action: result.audit.action,
          actorId: scope.actor.id,
          projectId: scope.project.id,
          targetId: result.audit.targetId,
          targetType: result.audit.targetType,
          after: { ...result.audit.after, keyHash, bodyHash },
          requestContext: input.context.requestContext,
        },
        tx,
      );
      await tx.businessLocationMutation.create({
        data: {
          ...where,
          actorId: scope.actor.id,
          bodyHash,
          result: receipt as Prisma.InputJsonValue,
        },
      });
      return { receipt, replayed: false };
    },
    { isolationLevel: "ReadCommitted" },
  );
}
