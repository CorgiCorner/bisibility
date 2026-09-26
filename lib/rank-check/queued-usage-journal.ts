import "server-only";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { recordUnchargedEvidence } from "@/lib/metering/uncharged-evidence";
import { createProviderRequestJournal } from "@/lib/provider-usage/request-journal";
import type { ProviderRequestAttribution } from "@/lib/provider-usage/tag";
import type { DataForSeoQueuedSubmissionResult } from "@/lib/providers/serp/dataforseo-queued";
import type { ProviderUsageObserver } from "@/lib/providers/usage";

export type QueuedTaskUsageInput = {
  attribution: ProviderRequestAttribution;
  correlationId: string;
  keywordId: string;
  estimate?: { cents: string; units: string };
};

export type QueuedTaskUsageJournal = {
  /** Withdraw every still-unknown row for tasks known not to have been sent. */
  discard(): Promise<void>;
  /** Record the receipts the provider response explicitly accounts for; leave the rest unknown. */
  settle(outcome: DataForSeoQueuedSubmissionResult): Promise<void>;
};

type JournalEntry = { id: string; observer: ProviderUsageObserver };

async function discardPending(client: PrismaClient, entries: Map<string, JournalEntry>) {
  const ids = [...entries.values()].map((entry) => entry.id);
  entries.clear();
  if (ids.length === 0) return;
  await client.providerCostEntry.deleteMany({
    where: { id: { in: ids }, measurementStatus: "unknown" },
  });
  for (const id of ids) await recordUnchargedEvidence(id);
}

async function settleKnown(
  entries: Map<string, JournalEntry>,
  outcome: DataForSeoQueuedSubmissionResult,
) {
  for (const task of outcome.accepted) {
    const entry = entries.get(task.correlationId);
    if (!entry || task.costCents === null) continue;
    await entry.observer.settle(entry.id, {
      cached: false,
      costCents: task.costCents,
      failed: false,
      providerRequestId: task.providerTaskId,
      quantity: 1,
    });
  }
  for (const task of outcome.failed) {
    const entry = entries.get(task.correlationId);
    if (!entry || task.costCents === null) continue;
    await entry.observer.settle(entry.id, {
      cached: false,
      costCents: task.costCents,
      failed: true,
      quantity: 1,
    });
  }
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
}): Promise<QueuedTaskUsageJournal> {
  const entries = new Map<string, JournalEntry>();
  try {
    for (const task of input.tasks) {
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
      const id = await journal.observer.begin();
      entries.set(task.correlationId, { id, observer: journal.observer });
    }
  } catch (error) {
    await discardPending(input.client, entries);
    throw error;
  }
  return {
    discard: () => discardPending(input.client, entries),
    settle: (outcome) => settleKnown(entries, outcome),
  };
}
