import "server-only";
import { randomUUID } from "node:crypto";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { type LocalProjectScope, localProjectScope } from "@/lib/local-monitoring-store/access";
import { localDigest, requireLocalTime } from "@/lib/local-monitoring-store/canonical";
import type {
  LocalDatabase,
  LocalStoreContext,
  LocalTransaction,
} from "@/lib/local-monitoring-store/context";
import { LocalMonitorConflictError, type MonitorMutationReceipt } from "./model";

export async function mutateMonitor<
  T extends { projectId: string; idempotencyKey: string },
>(input: {
  data: T;
  context: LocalStoreContext;
  operation: "create" | "revise" | "archive" | "schedule";
  db?: LocalDatabase;
  clock?: () => Date;
  execute(
    tx: LocalTransaction,
    scope: LocalProjectScope,
    now: Date,
  ): Promise<MonitorMutationReceipt>;
}) {
  const data = structuredClone(input.data);
  return (input.db ?? prisma).$transaction(async (tx) => {
    const scope = await localProjectScope(
      tx,
      input.context,
      data.projectId,
      input.operation === "create" ? "create" : "update",
      "local_measurement_target",
    );
    const keyHash = localDigest([data.idempotencyKey]);
    const bodyHash = localDigest([
      scope.actor.id,
      input.operation,
      { ...data, idempotencyKey: undefined },
    ]);
    const retained = await tx.localMonitorMutation.findFirst({
      where: { projectId: scope.project.id, operation: input.operation, keyHash },
    });
    if (retained) {
      if (retained.actorId !== scope.actor.id || retained.bodyHash !== bodyHash)
        throw new LocalMonitorConflictError();
      return { receipt: retained.result as unknown as MonitorMutationReceipt, replayed: true };
    }
    const result = await input.execute(
      tx,
      scope,
      requireLocalTime((input.clock ?? (() => new Date()))()),
    );
    await writeAudit(
      {
        action: `local_monitor.${input.operation}`,
        actorId: scope.actor.id,
        projectId: scope.project.id,
        targetType: "local_monitor",
        targetId: result.monitorId,
        requestContext: input.context.requestContext,
        after: {
          operation: input.operation,
          state: result.state,
          version: result.version,
          revisionId: result.revisionId,
          scheduleIntentId: result.scheduleIntentId,
          keyHash,
          bodyHash,
        },
      },
      tx,
    );
    await tx.localMonitorMutation.create({
      data: {
        id: randomUUID(),
        projectId: scope.project.id,
        operation: input.operation,
        keyHash,
        bodyHash,
        actorId: scope.actor.id,
        result: result as unknown as Prisma.InputJsonValue,
      },
    });
    return { receipt: result, replayed: false };
  });
}
