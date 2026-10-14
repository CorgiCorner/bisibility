import "server-only";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { deriveCheckAttemptSummary } from "@/lib/checks/attempts";
import type { Prisma } from "@/lib/generated/prisma/client";
import { Prisma as SQL } from "@/lib/generated/prisma/client";
import { recoveryInstance } from "@/lib/metering/recovery/tokens";
import { meteringNamespace } from "@/lib/metering/runtime";
import { persistRankCheckObservation } from "@/lib/observation/persist";
import type { ObservationRunInput } from "@/lib/observation/types";
import {
  ledgerActualCostCents,
  ledgerActualUnits,
  rankCheckLedgerActuals,
} from "@/lib/queries/rank-check-run-accounting";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { resolveSerpDepth } from "@/lib/serp/constants";
import { rankRecoveryContext } from "./recovery-context";
import { decodeRankResult } from "./recovery-evidence";
import { resultRecoveryCutoff } from "./recovery-result-grace";
import { recoverRunItem } from "./recovery-run-item";

export async function restoreRetainedRankResult(
  tx: Prisma.TransactionClient,
  checkId: string,
  actorId: string | null,
  now: Date,
) {
  await tx.$queryRaw`SELECT id FROM queued_rank_check_tasks WHERE "rankCheckId"=${checkId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM rank_checks WHERE id=${checkId} FOR UPDATE`;
  await tx.$queryRaw`SELECT run.id FROM rank_check_runs run JOIN rank_checks rc ON rc."runId"=run.id
    WHERE rc.id=${checkId} FOR UPDATE OF run`;
  const check = await tx.rankCheck.findUnique({
    where: { id: checkId },
    include: {
      keyword: { include: { locationRef: true, project: true } },
      run: true,
      queuedTask: true,
      recoveryResult: true,
    },
  });
  if (!check?.recoveryResult) return false;
  if (
    check.recoveryResult.namespace !== meteringNamespace() ||
    check.recoveryResult.instanceId !== recoveryInstance()
  )
    return false;
  if (check.status === "completed") {
    await tx.rankCheckResultEvidence.delete({ where: { rankCheckId: checkId } });
    return false;
  }
  const evidence = check.recoveryResult;
  if (evidence.createdAt > resultRecoveryCutoff(now)) return false;
  let blocked: string | null = evidence.expiresAt <= now ? "result_expired" : null;
  if (check.run && (check.run.deletedAt || ["cancelled", "cancelling"].includes(check.run.status)))
    blocked = "project_unavailable";
  const value = decodeRankResult(evidence),
    keyword = check.keyword;
  await tx.$queryRaw`SELECT id FROM keywords WHERE id=${keyword.id} FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM projects WHERE id=${keyword.projectId} FOR SHARE`;
  // Reread after locking: a concurrent keyword edit must not pass an old snapshot.
  const current = await tx.keyword.findUniqueOrThrow({
    where: { id: keyword.id },
    include: { locationRef: true, project: true },
  });
  const context = rankRecoveryContext(
    {
      text: current.text,
      device: current.device,
      domain: trackedProjectDomain(current.project.domain) ?? "",
      location: current.locationRef,
      revision: current.updatedAt,
    },
    resolveSerpDepth(check.requestedDepth ?? undefined),
  );
  if (
    value.target.keywordId !== check.keywordId ||
    value.target.projectId !== current.projectId ||
    value.result.rankCheck.keywordId !== check.keywordId ||
    context !== value.contextHash ||
    value.result.rankCheck.requestedDepth !== check.requestedDepth
  )
    blocked = "result_context_changed";
  if (current.archivedAt) blocked = "project_unavailable";
  if (value.target.queuedTaskId && check.queuedTask?.id !== value.target.queuedTaskId)
    blocked = "result_context_changed";
  if (
    check.queuedTask?.persistenceLeaseExpiresAt &&
    check.queuedTask.persistenceLeaseExpiresAt > now
  )
    blocked = "already_claimed";
  if (blocked === "already_claimed") return false;
  if (blocked) {
    await tx.rankCheckResultEvidence.update({
      where: { rankCheckId: checkId },
      data: { blockedCode: blocked },
    });
    return false;
  }
  const result = value.result.rankCheck;
  const actuals = (await rankCheckLedgerActuals(current.projectId, [checkId], tx)).get(checkId);
  const costCents = ledgerActualCostCents(actuals, null),
    units = ledgerActualUnits(actuals, null, result.provider);
  await tx.rankCheck.update({
    where: { id: checkId },
    data: {
      position: result.position,
      previousPosition: result.previousPosition,
      rankingUrl: result.rankingUrl,
      provider: result.provider,
      checkedAt: new Date(result.checkedAt),
      requestedDepth: result.requestedDepth,
      normalizationVersion: result.normalizationVersion,
      organicRanks: (result.organicRanks as Prisma.InputJsonValue) ?? SQL.DbNull,
      raw: (result.raw as Prisma.InputJsonValue) ?? SQL.JsonNull,
      expectedUrlAtCheck: value.target.expectedUrlAtCheck,
      ...deriveCheckAttemptSummary(value.target.attempts, result.provider, "completed"),
      attempts: value.target.attempts,
      billingUnits: units !== null && Number.isInteger(units) ? units : null,
      costCents,
      estimatedCostCents: null,
      status: "completed",
      error: null,
      errorCode: null,
      deferredReason: null,
      finishedAt: now,
    },
  });
  if (result.observation) {
    const observation = result.observation as ObservationRunInput;
    await persistRankCheckObservation(
      tx,
      { ...observation, executedAt: new Date(observation.executedAt) },
      current.projectId,
      checkId,
      value.result.definitionBindingId,
    );
  }
  if (check.queuedTask)
    await tx.queuedRankCheckTask.update({
      where: { id: check.queuedTask.id },
      data: { state: "completed", persistenceLeaseOwner: null, persistenceLeaseExpiresAt: null },
    });
  await recoverRunItem(tx, checkId, now);
  await writeAudit(
    {
      action: "rank_check.recovered",
      actorId,
      projectId: current.projectId,
      targetType: "rank_check",
      targetId: requiredPublicAuditId(check.publicId, "check", "Rank-check"),
      after: {
        keywordId: current.publicId,
        provider: result.provider,
        status: "completed",
        checkedAt: result.checkedAt,
      },
      before: { status: check.status },
    },
    tx,
  );
  await tx.rankCheckResultEvidence.delete({ where: { rankCheckId: checkId } });
  return true;
}
