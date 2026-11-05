import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { notifyOps } from "@/lib/ops/notify";
import { redactOpsText } from "@/lib/ops/redact-text";
import type { RankCheckPersistTarget } from "@/lib/rank-check/runner-persistence-types";
import type { RankCheckRunResult } from "@/lib/rank-check/runner-result";
import { evaluateKeywordAlerts } from "./evaluate";

const MAX_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 30_000;
const LEASE_MS = 30_000;

export type RankCheckAlertEvaluation = {
  alerts: { id: string }[];
  trigger: string | null;
};

type ProcessOptions = {
  evaluate?: (rankCheckId: string) => Promise<RankCheckAlertEvaluation>;
  limit?: number;
  now?: Date;
};

type StoredRankCheck = {
  checkedAt: Date;
  comparisonAllowed: boolean | null;
  id: string;
  keywordId: string;
  normalizationVersion: string | null;
  position: number | null;
  previousPosition: number | null;
  rankingUrl: string | null;
  raw: Prisma.JsonValue | null;
  requestedDepth: number | null;
  trigger: string | null;
};

function claimWhere(rankCheckId: string, now: Date): Prisma.AlertEvaluationIntentWhereInput {
  return {
    OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    rankCheckId,
    state: "pending",
  };
}

function retryDelayMs(attempts: number) {
  return BACKOFF_BASE_MS * 2 ** (attempts - 1);
}

export async function recordAlertEvaluationIntent(
  tx: Prisma.TransactionClient,
  rankCheckId: string,
  predecessorRankCheckId: string | null,
) {
  // Same transaction as the completed check, so a rollback cannot leave a dangling intent.
  // A replay must not restart the attempt cap or move a finished intent back to pending.
  const existing = await tx.alertEvaluationIntent.findUnique({
    select: { state: true },
    where: { rankCheckId },
  });
  if (!existing) {
    await tx.alertEvaluationIntent.create({
      data: { predecessorRankCheckId, rankCheckId, state: "pending" },
    });
    return;
  }
  if (existing.state !== "pending") return;
  await tx.alertEvaluationIntent.updateMany({
    data: { predecessorRankCheckId },
    where: { rankCheckId, state: "pending" },
  });
}

async function claimAlertEvaluationIntent(rankCheckId: string, now: Date) {
  const leaseUntil = new Date(Date.now() + LEASE_MS);
  const claimed = await prisma.alertEvaluationIntent.updateMany({
    data: { leaseUntil },
    where: claimWhere(rankCheckId, now),
  });
  return claimed.count === 1 ? leaseUntil : null;
}

async function completeAlertEvaluationIntent(rankCheckId: string, leaseUntil: Date, now: Date) {
  await prisma.alertEvaluationIntent.updateMany({
    data: { completedAt: now, leaseUntil: null, state: "done" },
    where: { leaseUntil, rankCheckId, state: "pending" },
  });
}

async function failAlertEvaluationIntent(rankCheckId: string, leaseUntil: Date, now: Date) {
  const current = await prisma.alertEvaluationIntent.findUnique({
    select: { attempts: true, leaseUntil: true, state: true },
    where: { rankCheckId },
  });
  if (current?.state !== "pending") return;
  if (current.leaseUntil?.getTime() !== leaseUntil.getTime()) return;
  const attempts = current.attempts + 1;
  const terminal = attempts >= MAX_ATTEMPTS;
  const updated = await prisma.alertEvaluationIntent.updateMany({
    data: terminal
      ? { attempts, completedAt: now, leaseUntil: null, state: "failed" }
      : { attempts, leaseUntil: new Date(Date.now() + retryDelayMs(attempts)) },
    where: { attempts: current.attempts, leaseUntil, rankCheckId, state: "pending" },
  });
  if (updated.count !== 1 || !terminal) return;
  await notifyOps({
    dedupeKey: `alert-evaluation-intent-failed:${rankCheckId}`,
    fields: { Attempts: String(attempts), "Rank check": rankCheckId },
    kind: "alert_evaluation_intent_failed",
    severity: "error",
    title: "Alert evaluation intent failed permanently",
  }).catch(() => undefined);
}

async function recoveryInput(check: StoredRankCheck) {
  const [intent, newer] = await Promise.all([
    prisma.alertEvaluationIntent.findUnique({
      select: { predecessorRankCheckId: true },
      where: { rankCheckId: check.id },
    }),
    prisma.rankCheck.findFirst({
      select: { id: true },
      where: {
        checkedAt: { gt: check.checkedAt },
        keywordId: check.keywordId,
        NOT: { id: check.id },
        status: "completed",
      },
    }),
  ]);
  const predecessor = intent?.predecessorRankCheckId
    ? await prisma.rankCheck.findUnique({
        select: { position: true, raw: true },
        where: { id: intent.predecessorRankCheckId },
      })
    : null;
  return {
    before: {
      position: predecessor ? predecessor.position : check.previousPosition,
      raw: predecessor?.raw ?? null,
    },
    skipStatefulTransitions: Boolean(newer),
  };
}

async function evaluateStoredRankCheck(rankCheckId: string): Promise<RankCheckAlertEvaluation> {
  const check = await prisma.rankCheck.findUnique({
    select: {
      checkedAt: true,
      comparisonAllowed: true,
      id: true,
      keywordId: true,
      normalizationVersion: true,
      position: true,
      previousPosition: true,
      rankingUrl: true,
      raw: true,
      requestedDepth: true,
      trigger: true,
    },
    where: { id: rankCheckId },
  });
  if (!check) throw new Error("Rank check is missing for alert evaluation.");
  const recovery = await recoveryInput(check);
  const alerts = await evaluateKeywordAlerts(
    check.keywordId,
    recovery.before,
    {
      checkedAt: check.checkedAt,
      normalizationVersion: check.normalizationVersion,
      position: check.position,
      rankCheckId: check.id,
      rankingUrl: check.rankingUrl,
      raw: check.raw,
      requestedDepth: check.requestedDepth,
    },
    {
      comparisonAllowed: check.comparisonAllowed ?? false,
      deliveryMode: check.trigger === "scheduled" ? "deferred" : "immediate",
      skipStatefulTransitions: recovery.skipStatefulTransitions,
    },
  );
  return { alerts, trigger: check.trigger };
}

export async function settleRankCheckAlerts(
  target: RankCheckPersistTarget,
  result: RankCheckRunResult,
  rankCheck: { id: string; raw: Prisma.JsonValue | null; trigger: string | null },
) {
  const claimedLease = await claimAlertEvaluationIntent(rankCheck.id, new Date()).catch(() => null);
  if (!claimedLease) return [];
  try {
    const alerts = await evaluateKeywordAlerts(
      target.keywordId,
      { position: result.rankCheck.previousPosition, raw: target.previousRaw ?? null },
      {
        checkedAt: result.rankCheck.checkedAt,
        normalizationVersion: result.rankCheck.normalizationVersion,
        position: result.rankCheck.position,
        rankCheckId: rankCheck.id,
        rankingUrl: result.rankCheck.rankingUrl,
        raw: rankCheck.raw,
        requestedDepth: result.rankCheck.requestedDepth,
      },
      {
        comparisonAllowed: result.comparisonAllowed,
        deliveryMode: rankCheck.trigger === "scheduled" ? "deferred" : "immediate",
      },
    );
    await completeAlertEvaluationIntent(rankCheck.id, claimedLease, new Date()).catch(
      () => undefined,
    );
    return alerts;
  } catch (error: unknown) {
    await failAlertEvaluationIntent(rankCheck.id, claimedLease, new Date()).catch(() => undefined);
    const message = redactOpsText(error);
    console.error("[rank-check] alert evaluation failed", {
      error: message,
      projectId: target.projectId,
      rankCheckId: rankCheck.id,
    });
    await notifyOps({
      dedupeKey: `alert-evaluation-failure:${target.projectId}`,
      fields: { Error: message, Project: target.projectId, "Rank check": rankCheck.id },
      kind: "alert_evaluation_failure",
      severity: "error",
      title: "Alert evaluation failed after rank check completion",
    }).catch(() => undefined);
    return [];
  }
}

function recoveredImmediateAlertIds(outcome: RankCheckAlertEvaluation) {
  if (outcome.trigger === "scheduled") return [];
  return outcome.alerts.map((alert) => alert.id);
}

export async function processPendingAlertEvaluationIntents(options: ProcessOptions = {}) {
  const now = options.now ?? new Date();
  const evaluate = options.evaluate ?? evaluateStoredRankCheck;
  const pending = await prisma.alertEvaluationIntent.findMany({
    orderBy: [{ leaseUntil: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
    select: { rankCheckId: true },
    take: options.limit ?? 20,
    where: {
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      state: "pending",
    },
  });
  const immediateAlertIds: string[] = [];
  let failed = 0;
  let processed = 0;
  for (const intent of pending) {
    const claimedLease = await claimAlertEvaluationIntent(intent.rankCheckId, now);
    if (!claimedLease) continue;
    try {
      const outcome = await evaluate(intent.rankCheckId);
      await completeAlertEvaluationIntent(intent.rankCheckId, claimedLease, now);
      immediateAlertIds.push(...recoveredImmediateAlertIds(outcome));
      processed += 1;
    } catch (error: unknown) {
      await failAlertEvaluationIntent(intent.rankCheckId, claimedLease, now).catch(() => undefined);
      failed += 1;
      console.error("[alerts] evaluation intent failed", {
        error: redactOpsText(error),
        rankCheckId: intent.rankCheckId,
      });
    }
  }
  return { failed, immediateAlertIds, processed };
}
