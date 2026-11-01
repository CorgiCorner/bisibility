import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { ProviderConnection } from "@/lib/generated/prisma/client";
import { recordRankRefusals } from "@/lib/integrations/provider-recovery/refusal-journal";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { DataForSeoError } from "@/lib/providers/serp/dataforseo-errors";
import { ProviderRecoveryAdmissionError } from "@/lib/providers/usage";
import { formatQuantity } from "@usagekit/core";
import { recordQueuedAccountFailure } from "./queued-account-failure";
import { deferQueuedRankCheckBatch, queuedBatchProgress } from "./queued-lifecycle";
import type { QueuedRefusalProof } from "./queued-refusal-contract";
import type { claimQueuedSubmission } from "./queued-submit-claim";
import { queuedSubmissionDiagnostic } from "./queued-submit-diagnostics";
import { markAmbiguous } from "./queued-submit-transitions";
import type { QueuedTaskUsageJournal } from "./queued-usage-journal";

type Connection = Pick<ProviderConnection, "id" | "credentialSource" | "credentialsEncrypted">;
export function queuedMinimumCapacity(journal: QueuedTaskUsageJournal | undefined) {
  const prices = journal?.pricedRequests?.map((request) =>
    request.estimate.find((q) => q.unit === "cents"),
  );
  if (!prices?.length || prices.some((price) => !price)) return null;
  return Math.max(
    ...prices.flatMap((price) => (price ? [Number(formatQuantity(price)) / 100] : [])),
  );
}

export async function recordQueuedCodes(
  connection: Connection,
  projectId: string,
  codes: readonly number[],
  journal?: QueuedTaskUsageJournal,
) {
  for (const statusCode of codes)
    await recordQueuedAccountFailure(
      connection,
      projectId,
      new DataForSeoError("Provider account evidence", false, 200, null, { statusCode }),
      queuedMinimumCapacity(journal),
    );
}

async function hasFencedRankCheck(rankCheckIds: readonly string[]) {
  return prisma.meteringPaidAttemptContext.findFirst({
    where: {
      fenced_at: { not: null },
      OR: rankCheckIds.map((id) => ({ context: { path: ["rankCheckId"], equals: id } })),
    },
    select: { operation_id: true },
  });
}

export async function persistQueuedRefusal(proof: QueuedRefusalProof) {
  const batch = await prisma.queuedRankCheckBatch.findUniqueOrThrow({
    where: { id: proof.batchId },
    select: { state: true, connectionId: true, tasks: { select: { rankCheckId: true } } },
  });
  if (["ambiguous", "completed", "deferred", "failed", "ready", "submitted"].includes(batch.state))
    return queuedBatchProgress(proof.batchId);
  const ids = new Set(batch.tasks.map((task) => task.rankCheckId));
  if (
    batch.state !== "submitting" ||
    batch.connectionId !== proof.connectionId ||
    !ids.size ||
    ids.size !== proof.rankCheckIds.length ||
    proof.rankCheckIds.some((id) => !ids.has(id))
  )
    throw new Error("Queued refusal no longer proves an unsent batch.");
  if (await hasFencedRankCheck(proof.rankCheckIds)) {
    await markAmbiguous(
      proof.batchId,
      "Submission was fenced before refusal persistence; recovering by task tag.",
      queuedSubmissionDiagnostic(proof.batchId, proof.connectionId, "unknown"),
    );
    return queuedBatchProgress(proof.batchId);
  }
  await recordRankRefusals(prisma, {
    connectionId: proof.connectionId,
    credentialVersion: proof.credentialVersion,
    checks: proof.rankCheckIds.map((rankCheckId) => ({ rankCheckId })),
    refusal: new ProviderRecoveryAdmissionError(
      proof.reason,
      proof.scope,
      undefined,
      proof.incidentId,
      proof.legacyVersion,
    ),
  });
  return deferQueuedRankCheckBatch(
    proof.batchId,
    proof.reason === "account_blocked" ? "provider_account_blocked" : "usage_unconfirmed",
    { preSend: true },
  );
}

export async function deferQueuedRefusal(
  batchId: string,
  connection: Connection,
  rankCheckIds: string[],
  refusal: ProviderRecoveryAdmissionError,
) {
  const proof: QueuedRefusalProof = {
    batchId,
    connectionId: connection.id,
    credentialVersion: ownCredentialVersion(
      "dataforseo",
      connection.id,
      connection.credentialsEncrypted,
    ),
    rankCheckIds,
    reason: refusal.reason,
    scope: refusal.scope,
    incidentId: refusal.incidentId,
    legacyVersion: refusal.legacyVersion,
  };
  try {
    const progress = await persistQueuedRefusal(proof);
    return { state: progress.state };
  } catch {
    return { state: "refusal_pending" as const, refusal: proof };
  }
}

export async function resumeQueuedRefusal(
  batchId: string,
  connectionId: string | null,
  rankCheckIds: readonly string[],
) {
  if (!connectionId || !rankCheckIds.length) return null;
  const rows = await prisma.providerBlockedAttempt.findMany({
    where: { connectionId, rankCheckId: { in: [...rankCheckIds] }, transportPhase: "not_sent" },
    select: { rankCheckId: true, refusalKey: true, reason: true },
  });
  const candidates = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.reason !== "account_blocked" && row.reason !== "accounting_review") continue;
    const key = JSON.stringify([row.refusalKey, row.reason]);
    const checks = candidates.get(key) ?? new Set<string>();
    checks.add(row.rankCheckId);
    candidates.set(key, checks);
  }
  const complete = [...candidates].filter(([, checks]) =>
    rankCheckIds.every((id) => checks.has(id)),
  );
  if (complete.length !== 1) return null;
  if (await hasFencedRankCheck(rankCheckIds)) return null;
  const [key] = complete[0];
  const reason = rows.find((row) => JSON.stringify([row.refusalKey, row.reason]) === key)?.reason;
  const progress = await deferQueuedRankCheckBatch(
    batchId,
    reason === "account_blocked" ? "provider_account_blocked" : "usage_unconfirmed",
    { preSend: true },
  );
  return { state: progress.state };
}

export async function resumeUnclaimedBatch(
  batchId: string,
  batch: Awaited<ReturnType<typeof claimQueuedSubmission>>["batch"],
) {
  if (batch.state !== "submitting") return { state: batch.state };
  const connectionId = batch.connection?.id ?? null;
  const refusal = await resumeQueuedRefusal(
    batchId,
    connectionId,
    batch.tasks.map((task) => task.rankCheckId),
  );
  return (
    refusal ??
    markAmbiguous(
      batchId,
      "Submission activity resumed after the paid-call fence; recovering by task tag.",
      queuedSubmissionDiagnostic(batchId, connectionId, "unknown"),
    )
  );
}

export async function resumePriorRefusal(batchId: string) {
  const batch = await prisma.queuedRankCheckBatch.findUniqueOrThrow({
    where: { id: batchId },
    select: { connectionId: true, tasks: { select: { rankCheckId: true } } },
  });
  return resumeQueuedRefusal(
    batchId,
    batch.connectionId,
    batch.tasks.map((task) => task.rankCheckId),
  );
}
