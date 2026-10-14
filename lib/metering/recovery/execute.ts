import "server-only";
import { randomUUID } from "node:crypto";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { meteringNamespace } from "@/lib/metering/runtime";
import { recoveryErrorCode } from "@/lib/provider-usage/recovery-error";
import { restoreRetainedRankResult } from "@/lib/rank-check/recovery-restore";
import { requestOriginalRunResume } from "@/lib/rank-check/recovery-run-grant";
import { publishWorkerIntent } from "@/lib/worker-intents/realtime";
import { assertRecoveryAdmin } from "./authorization";
import { classifyRecoveryRecord } from "./classify";
import { recordFailure, stopFailedCommand } from "./command-failure";
import {
  RECOVERY_COMMAND_LEASE_MS as LEASE_MS,
  type RecoveryCommandInput,
  recoveryCommandSchema,
} from "./command-input";
import type { RecoveryOutcome } from "./contract";
import { recoverOriginalProof } from "./proof";
import { readRecoveryRecords } from "./query";
import { openRecoveryCase, type RecoveryTokenScope, recoveryInstance } from "./tokens";

async function claim(database: PrismaClient, namespace: string, now: Date) {
  return database.$transaction(async (tx) => {
    const [candidate] = await tx.meteringRecoveryCommand.findMany({
      where: {
        namespace,
        input: { path: ["instance"], equals: recoveryInstance() },
        OR: [{ state: "queued" }, { state: "running", leaseExpiresAt: { lt: now } }],
      },
      orderBy: [{ createdAt: "asc" }, { commandId: "asc" }],
      take: 1,
    });
    if (!candidate) return null;
    const leaseId = randomUUID();
    const updated = await tx.meteringRecoveryCommand.updateMany({
      where: {
        namespace,
        commandId: candidate.commandId,
        state: candidate.state,
        leaseId: candidate.leaseId,
      },
      data: { state: "running", leaseId, leaseExpiresAt: new Date(now.getTime() + LEASE_MS) },
    });
    return updated.count === 1 ? { ...candidate, leaseId } : null;
  });
}

async function nextCase(
  tx: Prisma.TransactionClient,
  namespace: string,
  commandId: string,
  leaseId: string,
  scope: RecoveryTokenScope,
  input: RecoveryCommandInput,
  now: Date,
) {
  await tx.$queryRaw`SELECT "commandId" FROM metering_recovery_commands WHERE namespace=${namespace} AND "commandId"=${commandId} FOR UPDATE`;
  const current = await tx.meteringRecoveryCommand.findUniqueOrThrow({
    where: { namespace_commandId: { namespace, commandId } },
  });
  if (current.state !== "running" || current.leaseId !== leaseId) return false;
  await assertRecoveryAdmin(tx, scope.actor);
  const outcomes = (current.result as RecoveryOutcome[]) ?? [],
    item = input.items[outcomes.length];
  if (!item) return false;
  const identity = openRecoveryCase(item.token, scope);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`recovery-case:${namespace}:${identity.kind}:${identity.id}`}))`;
  const [row] = await readRecoveryRecords(tx, namespace, { to: now, identity, limit: 1 });
  let outcome: RecoveryOutcome = { caseToken: item.token, status: "skipped", code: "case_changed" };
  if (row) {
    const classified = classifyRecoveryRecord(row, scope, now);
    if (classified.version === item.version && classified.action === item.action) {
      const changed =
        item.action === "recover_proof"
          ? await recoverOriginalProof(tx, row, now)
          : item.action === "restore_result" && row.rankCheckId
            ? await restoreRetainedRankResult(tx, row.rankCheckId, scope.actor, now)
            : item.action === "resume_queued_run" && row.runId
              ? await requestOriginalRunResume(tx, row.runId, now)
              : false;
      outcome = {
        caseToken: item.token,
        status: changed
          ? item.action === "resume_queued_run"
            ? "queued"
            : "recovered"
          : "unchanged",
        code: null,
      };
      await writeAudit(
        {
          action: "instance_admin.metering_recovery_applied",
          actorId: scope.actor,
          targetType: "instance_ops",
          targetId: "metering-recovery",
          after: { commandId, action: item.action, result: outcome.status },
        },
        tx,
      );
    }
  }
  outcomes.push(outcome);
  await tx.meteringRecoveryCommand.update({
    where: { namespace_commandId: { namespace, commandId } },
    data: {
      result: outcomes as Prisma.InputJsonValue,
      state: outcomes.length === input.items.length ? "completed" : "running",
      leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
    },
  });
  return true;
}

/** Bounded, resumable work; no caller's paid HTTP request is ever replayed. */
export async function processRecoveryCommands(
  database: PrismaClient = prisma,
  options: { namespace?: string; limit?: number } = {},
) {
  const namespace = options.namespace ?? meteringNamespace(),
    command = await claim(database, namespace, new Date());
  if (!command) return { processed: 0, hasMore: false };
  const parsed = recoveryCommandSchema.safeParse(command.input);
  if (!parsed.success) {
    await database.meteringRecoveryCommand.update({
      where: { namespace_commandId: { namespace, commandId: command.commandId } },
      data: { state: "failed", leaseId: null, leaseExpiresAt: null },
    });
    return { processed: 0, hasMore: false };
  }
  const input = parsed.data,
    scope = { actor: command.actorId, namespace, instance: input.instance };
  let processed = 0;
  for (let index = 0; index < Math.min(4, Math.max(1, options.limit ?? 4)); index++) {
    try {
      const advanced = await database.$transaction(
        (tx) =>
          nextCase(tx, namespace, command.commandId, command.leaseId, scope, input, new Date()),
        { timeout: 30000 },
      );
      if (!advanced) break;
      processed++;
    } catch (error) {
      let advanced = false;
      try {
        advanced = await recordFailure(
          database,
          namespace,
          command.commandId,
          command.leaseId,
          scope,
          input,
          error,
        );
      } catch (failure) {
        if (
          ["transaction_timeout", "transaction_conflict", "store_unavailable"].includes(
            recoveryErrorCode(failure),
          )
        )
          break;
        // A permanently unreadable command cannot monopolize the oldest-first queue.
        await stopFailedCommand(database, namespace, command.commandId, command.leaseId);
        break;
      }
      if (!advanced) break;
      processed++;
    }
  }
  const current = await database.meteringRecoveryCommand.findUniqueOrThrow({
    where: { namespace_commandId: { namespace, commandId: command.commandId } },
  });
  if ((current.result as RecoveryOutcome[] | null)?.some((item) => item.status === "queued"))
    await publishWorkerIntent("rank_run");
  if (current.state === "running" && current.leaseId === command.leaseId)
    await database.meteringRecoveryCommand.updateMany({
      where: { namespace, commandId: command.commandId, leaseId: command.leaseId },
      data: { state: "queued", leaseId: null, leaseExpiresAt: null },
    });
  const queued = await database.meteringRecoveryCommand.count({
    where: {
      namespace,
      state: "queued",
      input: { path: ["instance"], equals: recoveryInstance() },
    },
  });
  return { processed, hasMore: queued > 0 };
}
