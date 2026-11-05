import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { meteringNamespace } from "@/lib/metering/runtime";
import { Prisma as SQL } from "@/lib/metering/store/host-sql";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { decryptProviderCredentials } from "@/lib/providers/crypto";
import { DataForSeoError } from "@/lib/providers/serp/dataforseo-errors";
import { fetchDataForSeoQueuedResult } from "@/lib/providers/serp/dataforseo-queued";
import type { ProviderCredentials } from "@/lib/providers/types";
import { type QueuedCostCandidate, queuedCostCandidates } from "./queued-cost-candidates";
import {
  parseQueuedCostEvidence,
  QUEUED_COST_MAX_ATTEMPTS,
  type QueuedCostEvidence,
  type QueuedCostReason,
  queuedCostAccountRetryMs,
  queuedCostBackoffMs,
} from "./queued-cost-evidence";
import { explicitQueuedGetCostCents } from "./queued-hosted-results";
import { dataForSeoQueuedResponseTask, pollDataForSeoQueue } from "./queued-provider-poll";

export const QUEUED_COST_RECOVERY_BATCH_SIZE = 5;
const ACCOUNT_HTTP_STATUSES = new Set([401, 402, 403]);
// DataForSEO answers account refusals with HTTP 200 and one of these envelope or task codes
// (authentication, verification, payment). Rate limits and lookup errors are deliberately absent.
const ACCOUNT_STATUS_CODES = new Set([40100, 40101, 40104, 40200, 40201, 40210]);

const isAccountStatus = (code: number | undefined) =>
  code !== undefined && ACCOUNT_STATUS_CODES.has(code);
/** A definite "task not found or expired" answer is the only absence that is final evidence. */
const isNotFoundStatus = (code: number | undefined) =>
  code !== undefined && code >= 40400 && code < 40500;

type Outcome = "recovered" | "retry" | "unrecoverable" | "skipped" | "failed";
type Client = Pick<PrismaClient, "$queryRaw" | "$executeRaw">;

function usableCredentials(envelope: string | null): ProviderCredentials | null {
  try {
    const stored = decryptProviderCredentials(envelope);
    // The platform environment key must never stand in for a customer's own account.
    return stored.login && stored.password ? stored : null;
  } catch {
    return null;
  }
}

/** The write is conditional on the evidence we read, so a concurrent settler wins cleanly. */
async function writeEvidence(
  client: Client,
  row: QueuedCostCandidate,
  evidence: QueuedCostEvidence,
  costCents: number | null,
) {
  const previous = row.evidence === null ? null : JSON.stringify(row.evidence);
  const changed = await client.$executeRaw(SQL.sql`UPDATE queued_rank_check_tasks
    SET "costEvidence"=${JSON.stringify(evidence)}::jsonb,
      "costCents"=${costCents === null ? null : costCents.toFixed(4)}::numeric
    WHERE id=${row.taskId} AND "providerTaskId"=${row.providerTaskId} AND "costCents" IS NULL AND state IN ('failed','deferred')
      AND "costEvidence" IS NOT DISTINCT FROM ${previous}::jsonb`);
  return changed === 1;
}

function evidenceFor(
  row: QueuedCostCandidate,
  now: Date,
  status: QueuedCostEvidence["status"],
  extra: Partial<QueuedCostEvidence> = {},
): QueuedCostEvidence {
  return {
    v: 1,
    status,
    attempts: parseQueuedCostEvidence(row.evidence)?.attempts ?? 0,
    at: now.toISOString(),
    source: "task_get",
    providerTaskId: row.providerTaskId,
    credentialVersion: row.retainedVersion,
    ...extra,
  };
}

function failure(
  row: QueuedCostCandidate,
  now: Date,
  reason: QueuedCostReason,
  final: boolean,
  extra: Partial<QueuedCostEvidence> = {},
) {
  const attempts = (parseQueuedCostEvidence(row.evidence)?.attempts ?? 0) + 1;
  if (reason === "account_incident")
    return evidenceFor(row, now, "retry", {
      reason,
      nextAt: new Date(now.getTime() + queuedCostAccountRetryMs()).toISOString(),
      ...extra,
    });
  if (final || attempts >= QUEUED_COST_MAX_ATTEMPTS)
    return evidenceFor(row, now, "unrecoverable", {
      reason,
      attempts,
      ...extra,
    });
  return evidenceFor(row, now, "retry", {
    reason,
    attempts,
    nextAt: new Date(now.getTime() + queuedCostBackoffMs(attempts)).toISOString(),
    ...extra,
  });
}

/**
 * A row that could not be examined this tick (rate limit, transient outage, local fault) is pushed
 * back without counting an attempt, so it neither burns the cap nor blocks the rows behind it.
 */
function deferral(row: QueuedCostCandidate, now: Date) {
  const attempts = parseQueuedCostEvidence(row.evidence)?.attempts ?? 0;
  return evidenceFor(row, now, "retry", {
    reason: "provider_unreachable",
    attempts,
    nextAt: new Date(now.getTime() + queuedCostBackoffMs(Math.max(1, attempts))).toISOString(),
  });
}

async function providerCost(row: QueuedCostCandidate, credentials: ProviderCredentials) {
  const polled = await pollDataForSeoQueue(credentials, row.projectId, () =>
    fetchDataForSeoQueuedResult(credentials, row.providerTaskId),
  ).catch((error: unknown) => {
    if (!(error instanceof DataForSeoError)) throw error;
    return { status: "error" as const, error };
  });
  if (polled.status === "pending" || polled.status === "deadline_reached")
    return { kind: "skip" as const };
  if (polled.status === "error") {
    const { httpStatus, statusCode } = polled.error;
    const code = statusCode === undefined ? {} : { statusCode };
    if (
      (httpStatus !== undefined && ACCOUNT_HTTP_STATUSES.has(httpStatus)) ||
      isAccountStatus(statusCode)
    )
      return {
        kind: "failure" as const,
        reason: "account_incident" as const,
        ...code,
      };
    if (isNotFoundStatus(statusCode))
      return {
        kind: "failure" as const,
        reason: "provider_task_unavailable" as const,
        final: true,
        ...code,
      };
    return {
      kind: "failure" as const,
      reason: "provider_unreachable" as const,
      ...code,
    };
  }
  const tasks = polled.value.tasks?.filter((task) => task.id === row.providerTaskId) ?? [];
  const matched = dataForSeoQueuedResponseTask(polled.value, row.providerTaskId);
  const statusCode = typeof matched?.status_code === "number" ? matched.status_code : undefined;
  const code = statusCode === undefined ? {} : { statusCode };
  if (isAccountStatus(statusCode))
    return {
      kind: "failure" as const,
      reason: "account_incident" as const,
      ...code,
    };
  if (isNotFoundStatus(statusCode))
    return {
      kind: "failure" as const,
      reason: "provider_task_unavailable" as const,
      final: true,
      ...code,
    };
  // One answer that lacks the task, or names it twice, is a provider glitch rather than expiry.
  if (!matched || tasks.length !== 1)
    return {
      kind: "failure" as const,
      reason: "provider_task_unavailable" as const,
      ...code,
    };
  const reported = explicitQueuedGetCostCents(polled.value, row.providerTaskId);
  // A zero under an expired-history or partial status says nothing about what the paid task cost.
  const cost =
    reported === 0 && statusCode !== undefined && statusCode !== 20000 && statusCode !== 40102
      ? null
      : reported;
  const bodyHash = createHash("sha256")
    .update(JSON.stringify([matched.id, statusCode, matched.cost ?? null]))
    .digest("hex");
  return cost === null
    ? {
        kind: "failure" as const,
        reason: "cost_not_reported" as const,
        statusCode,
        bodyHash,
      }
    : { kind: "cost" as const, cost, statusCode, bodyHash };
}

async function recoverOne(client: Client, row: QueuedCostCandidate, now: Date): Promise<Outcome> {
  const version = ownCredentialVersion("dataforseo", row.connectionId, row.envelope);
  const write = async (evidence: QueuedCostEvidence, cost: number | null = null) =>
    (await writeEvidence(client, row, evidence, cost))
      ? evidence.status === "recovered"
        ? "recovered"
        : evidence.status
      : "skipped";
  if (!row.retainedVersion || version !== row.retainedVersion)
    return write(failure(row, now, "credential_changed", true));
  if (row.incident) return write(failure(row, now, "account_incident", false));
  const credentials = usableCredentials(row.envelope);
  if (!credentials) return write(failure(row, now, "credentials_unavailable", true));
  const result = await providerCost(row, credentials);
  if (result.kind === "skip") {
    await writeEvidence(client, row, deferral(row, now), null);
    return "skipped";
  }
  if (result.kind === "cost")
    return write(
      evidenceFor(row, now, "recovered", {
        statusCode: result.statusCode,
        bodyHash: result.bodyHash,
      }),
      result.cost,
    );
  return write(
    failure(row, now, result.reason, "final" in result && result.final === true, {
      ...("statusCode" in result && result.statusCode !== undefined
        ? { statusCode: result.statusCode }
        : {}),
      ...("bodyHash" in result ? { bodyHash: result.bodyHash } : {}),
    }),
  );
}

/**
 * Bounded maintenance step. A free, read-only task_get with the original own-key credentials
 * recovers the cost the provider reported; nothing is estimated and no dispatch grant exists here.
 * The reconciler settles the recorded cost on its next scan.
 */
export async function maintainQueuedTaskCosts(
  options: { now?: Date; namespace?: string; client?: Client; limit?: number } = {},
) {
  const client = options.client ?? prisma;
  const now = options.now ?? new Date();
  const rows = await queuedCostCandidates(
    client,
    options.namespace ?? meteringNamespace(),
    now,
    options.limit ?? QUEUED_COST_RECOVERY_BATCH_SIZE,
  );
  const result = {
    examined: rows.length,
    recovered: 0,
    retry: 0,
    unrecoverable: 0,
    skipped: 0,
    failed: 0,
  };
  for (const row of rows) {
    // Rows are independent: a fault on one never aborts the batch or keeps its place in line.
    try {
      result[await recoverOne(client, row, now)]++;
    } catch {
      result.failed++;
      await writeEvidence(client, row, deferral(row, now), null).catch(() => false);
    }
  }
  return result;
}
