import "server-only";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { NativeRequestGuard, PaidFenceHook } from "@/lib/metering/paid-attempt-types";
import { ownAdmission } from "@/lib/provider-usage/admission-extension";
import { beginProviderTaskset, queuedEvidenceId } from "@/lib/provider-usage/batch-request-journal";
import { discardByokEvidence } from "@/lib/provider-usage/byok-evidence";
import { createProviderRequestJournal } from "@/lib/provider-usage/request-journal";
import type { ProviderRequestAttribution } from "@/lib/provider-usage/tag";
import type { DataForSeoQueuedSubmissionResult } from "@/lib/providers/serp/dataforseo-queued";
import type { ProviderUsageObserver } from "@/lib/providers/usage";
import type { PricedRequest, ProviderRequest } from "@usagekit/providers";
import { activitySettlementBudget, type SettlementBudget } from "./queued-usage-budget";

export type QueuedTaskUsageInput = {
  maxCostCents?: string;
  attribution: ProviderRequestAttribution;
  correlationId: string;
  keywordId: string;
  estimate?: { cents: string; units: string };
};

export type QueuedTaskUsageJournal = {
  readonly pricedRequests?: readonly PricedRequest[];
  /** Withdraw every still-unknown row for tasks known not to have been sent. */
  discard(): Promise<void>;
  /**
   * Record the receipts the provider response explicitly accounts for.
   * Receipts that do not fit the remaining activity budget stay unknown and are returned.
   */
  settle(
    outcome: DataForSeoQueuedSubmissionResult,
    budget?: SettlementBudget,
  ): Promise<QueuedUsageSettlement>;
  transportStarted(): Promise<void>;
};

type JournalEntry = { id: string; observer: ProviderUsageObserver };

export type QueuedUsageSettlement = { deferred: readonly string[] };

export class QueuedUsageSettlementError extends Error {
  readonly deferred: readonly string[];

  constructor(cause: unknown, deferred: readonly string[]) {
    super("Queued usage settlement failed.", { cause });
    this.name = "QueuedUsageSettlementError";
    this.deferred = deferred;
  }
}

type SettleTask = {
  correlationId: string;
  costCents: number | null;
  failed: boolean;
  providerRequestId?: string;
};

async function discardPending(client: PrismaClient, entries: Map<string, JournalEntry>) {
  const ids = [...entries.values()].map((entry) => entry.id);
  if (ids.length === 0) return;
  await client.$transaction(async (tx) => {
    await ownAdmission.cancel(tx, ids);
    await discardByokEvidence(tx, ids);
  });
  entries.clear();
}

function outcomeReceipts(outcome: DataForSeoQueuedSubmissionResult): SettleTask[] {
  return [
    ...outcome.accepted.map((task) => ({
      correlationId: task.correlationId,
      costCents: task.costCents,
      failed: false,
      providerRequestId: task.providerTaskId,
    })),
    ...outcome.failed.map((task) => ({
      correlationId: task.correlationId,
      costCents: task.costCents,
      failed: true,
      providerRequestId: undefined,
    })),
  ];
}

/**
 * Each receipt settles in its own transaction. One failure must not leave the other attempted
 * tasks unknown, so every receipt that fits the activity budget is attempted before the first
 * failure is reported. The rest stay unknown for a later activity; this never posts a task.
 */
async function settleKnown(
  entries: Map<string, JournalEntry>,
  outcome: DataForSeoQueuedSubmissionResult,
  budget: SettlementBudget = activitySettlementBudget(),
): Promise<QueuedUsageSettlement> {
  const deferred: string[] = [];
  const failures: unknown[] = [];
  for (const { correlationId, costCents, failed, providerRequestId } of outcomeReceipts(outcome)) {
    const entry = entries.get(correlationId);
    if (!entry || costCents === null) continue;
    if (!budget.allowsAnother()) {
      deferred.push(correlationId);
      continue;
    }
    await entry.observer
      .settle(entry.id, {
        cached: false,
        costCents,
        failed,
        ...(providerRequestId ? { providerRequestId } : {}),
        quantity: 1,
      })
      .catch((error: unknown) => failures.push(error));
  }
  if (failures.length > 0) throw new QueuedUsageSettlementError(failures[0], deferred);
  return { deferred };
}

/**
 * Durably journal every queued task as a pending unknown charge before the paid batch POST.
 * A begin failure discards the rows already begun in this attempt: no POST follows, so no
 * task may keep an unknown charge for a request known not to have been sent.
 */
export async function beginQueuedTaskUsageJournal(input: {
  client: PrismaClient;
  connectionId: string;
  projectId: string;
  tasks: QueuedTaskUsageInput[];
  credentialVersion?: string | null;
  providerRequests?: readonly ProviderRequest[];
  beforeFence?: PaidFenceHook;
  beforeReserve?: ReadonlyMap<string, NativeRequestGuard>;
}): Promise<QueuedTaskUsageJournal> {
  if (input.providerRequests && input.providerRequests.length !== input.tasks.length)
    throw new Error("Queued taskset pricing requires one request per task");
  const entries = new Map<string, JournalEntry>();
  const taskset = await beginProviderTaskset(
    input.client,
    input.tasks.map((task, index) => ({
      ...task,
      connectionId: input.connectionId,
      projectId: input.projectId,
      provider: "dataforseo",
      unit: "cents",
      credentialVersion: input.credentialVersion,
      ...(input.providerRequests ? { providerRequest: input.providerRequests[index] } : {}),
    })),
    input.beforeReserve,
  );
  try {
    for (const { input: task, id } of taskset.identities) {
      const journal = createProviderRequestJournal(input.client, {
        attribution: task.attribution,
        connectionId: input.connectionId,
        keywordId: task.keywordId,
        projectId: input.projectId,
        provider: "dataforseo",
        unit: "cents",
        queued: true,
        estimate: task.estimate,
      });
      entries.set(task.attribution.context.correlationId, { id, observer: journal.observer });
    }
  } catch (error) {
    await discardPending(input.client, entries);
    throw error;
  }
  return {
    ...(input.providerRequests
      ? {
          pricedRequests: taskset.grants.map((grant) => {
            if (!grant.pricedRequest) throw new Error("Missing admitted taskset request");
            return grant.pricedRequest;
          }),
        }
      : {}),
    discard: () => discardPending(input.client, entries),
    settle: (outcome, budget) => settleKnown(entries, outcome, budget),
    transportStarted: () => ownAdmission.fence(input.client, taskset.grants, input.beforeFence),
  };
}

type ResumeTask = {
  id: string;
  costCents: number | { toString(): string } | null;
  providerTaskId: string | null;
  state: string;
};

/** Settle unknown receipts already stored for a submitted batch. Does not admit or post. */
export async function resumeSubmittedQueuedUsage(input: {
  client: PrismaClient;
  connectionId: string;
  projectId: string;
  tasks: readonly ResumeTask[];
}): Promise<QueuedUsageSettlement> {
  const pending: Array<SettleTask & { id: string }> = [];
  for (const task of input.tasks) {
    if (task.costCents == null) continue;
    const costCents = Number(task.costCents);
    if (!Number.isFinite(costCents)) continue;
    if (task.state !== "provider_failed" && !task.providerTaskId) continue;
    const id = queuedEvidenceId(input.connectionId, task.id);
    const row = await input.client.meteringUsageEvidence.findUnique({
      select: { discarded: true, measurementStatus: true },
      where: { id },
    });
    if (!row || row.discarded || row.measurementStatus !== "unknown") continue;
    pending.push({
      correlationId: task.id,
      costCents,
      failed: task.state === "provider_failed",
      id,
      providerRequestId:
        task.state === "provider_failed" ? undefined : (task.providerTaskId ?? undefined),
    });
  }
  if (pending.length === 0) return { deferred: [] };
  const first = pending[0];
  if (!first) return { deferred: [] };
  const journal = createProviderRequestJournal(input.client, {
    attribution: {
      context: {
        correlationId: first.correlationId,
        feature: "rank_check",
        projectId: input.projectId,
        source: "worker",
        trigger: "scheduled",
      },
      tag: "queued-usage-resume",
    },
    connectionId: input.connectionId,
    projectId: input.projectId,
    provider: "dataforseo",
    queued: true,
    unit: "cents",
  });
  return settleKnown(
    new Map(
      pending.map((receipt) => [
        receipt.correlationId,
        { id: receipt.id, observer: journal.observer },
      ]),
    ),
    {
      accepted: pending.flatMap((receipt) =>
        receipt.failed || !receipt.providerRequestId
          ? []
          : [
              {
                correlationId: receipt.correlationId,
                costCents: receipt.costCents,
                providerTaskId: receipt.providerRequestId,
                tag: "",
              },
            ],
      ),
      failed: pending.flatMap((receipt) =>
        receipt.failed
          ? [
              {
                correlationId: receipt.correlationId,
                costCents: receipt.costCents,
                message: "Queued provider task failed before usage settlement.",
              },
            ]
          : [],
      ),
      unknown: [],
    },
  );
}
