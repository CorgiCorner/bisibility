import "server-only";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { retainRecoveryIncident } from "@/lib/provider-usage/reconciliation-health";
import { recoveryErrorCode } from "@/lib/provider-usage/recovery-error";
import { RecoveryAuthorizationError } from "./authorization";
import { RECOVERY_COMMAND_LEASE_MS as LEASE_MS, type RecoveryCommandInput } from "./command-input";
import type { RecoveryOutcome } from "./contract";
import { openRecoveryCase, type RecoveryTokenScope } from "./tokens";
export async function recordFailure(
  database: PrismaClient,
  namespace: string,
  commandId: string,
  leaseId: string,
  scope: RecoveryTokenScope,
  input: RecoveryCommandInput,
  error: unknown,
) {
  return database.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "commandId" FROM metering_recovery_commands WHERE namespace=${namespace} AND "commandId"=${commandId} FOR UPDATE`;
    const current = await tx.meteringRecoveryCommand.findUniqueOrThrow({
      where: { namespace_commandId: { namespace, commandId } },
    });
    if (current.state !== "running" || current.leaseId !== leaseId) return false;
    const outcomes = (current.result as RecoveryOutcome[]) ?? [],
      item = input.items[outcomes.length];
    if (!item) return false;
    if (error instanceof RecoveryAuthorizationError) {
      const rejected = input.items
        .slice(outcomes.length)
        .map((next) => ({ caseToken: next.token, status: "skipped", code: "forbidden" }));
      await tx.meteringRecoveryCommand.update({
        where: { namespace_commandId: { namespace, commandId } },
        data: {
          state: "failed",
          result: [...outcomes, ...rejected],
          leaseId: null,
          leaseExpiresAt: null,
        },
      });
      return false;
    }
    let identity: ReturnType<typeof openRecoveryCase>;
    try {
      identity = openRecoveryCase(item.token, scope);
    } catch {
      await tx.meteringRecoveryCommand.update({
        where: { namespace_commandId: { namespace, commandId } },
        data: {
          state: "failed",
          leaseId: null,
          leaseExpiresAt: null,
          result: [
            ...outcomes,
            ...input.items.slice(outcomes.length).map((next) => ({
              caseToken: next.token,
              status: "failed",
              code: "original_authority_missing",
            })),
          ],
        },
      });
      return false;
    }
    const code = recoveryErrorCode(error),
      now = new Date();
    if (
      item.action === "recover_proof" &&
      (identity.kind === "operation" || identity.kind === "evidence")
    ) {
      const cursor = `${identity.kind === "operation" ? "o" : "e"}:${identity.id}`;
      await retainRecoveryIncident(
        tx,
        `authoritative-reconciliation-error:${JSON.stringify([namespace, cursor])}`,
        {
          namespace,
          origin: "admin",
          kind: identity.kind,
          id: identity.id,
          code,
          failedAt: now.toISOString(),
          scanCutoff: now.toISOString(),
        },
      );
    }
    outcomes.push({ caseToken: item.token, status: "failed", code });
    await tx.meteringRecoveryCommand.update({
      where: { namespace_commandId: { namespace, commandId } },
      data: {
        result: outcomes as Prisma.InputJsonValue,
        state: outcomes.length === input.items.length ? "completed" : "running",
        leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
      },
    });
    return true;
  });
}

export async function stopFailedCommand(
  database: PrismaClient,
  namespace: string,
  commandId: string,
  leaseId: string,
) {
  return database.meteringRecoveryCommand.updateMany({
    where: { namespace, commandId, state: "running", leaseId },
    data: { state: "failed", leaseId: null, leaseExpiresAt: null },
  });
}
