import "server-only";

import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { beginUsageEntry, syncUsageEntry } from "@/lib/metering/entry-sync";
import { recordUnchargedEvidence } from "@/lib/metering/uncharged-evidence";
import {
  type ProviderUsageObserver,
  ProviderUsagePersistenceError,
  type ProviderUsageReceipt,
} from "@/lib/providers/usage";
import { recordProviderUsage } from "./recorder";
import type { ProviderRequestAttribution } from "./tag";

type JournalInput = {
  attribution: ProviderRequestAttribution;
  connectionId: string;
  keywordId?: string;
  projectId: string;
  provider: string;
  unit: "cents" | "units";
  estimate?: { cents: string; units: string };
  queued?: boolean;
};

export function createProviderRequestJournal(db: PrismaClient, input: JournalInput) {
  let started = 0;
  let quantity: number | null = 0;
  let costCents: number | null = 0;
  const measurements = new Map<string, ProviderUsageReceipt>();
  let beginQueue = Promise.resolve();
  const inFlight = new Set<string>();
  const observer: ProviderUsageObserver = {
    async begin() {
      const next = beginQueue.then(begin);
      beginQueue = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    },
    async settle(id, receipt) {
      try {
        await settle(id, receipt);
      } catch (cause) {
        // A competing receipt with the same provider request id can win the unique index.
        if (cause && typeof cause === "object" && "code" in cause && cause.code === "P2002") {
          try {
            await settle(id, receipt);
            return;
          } catch {
            /* Keep the durable unknown row. */
          }
        }
        throw new ProviderUsagePersistenceError({ cause, phase: "settlement", attemptId: id });
      } finally {
        inFlight.delete(id);
      }
    },
  };

  async function begin() {
    try {
      const unresolved = await db.providerCostEntry.findFirst({
        select: { id: true },
        where: {
          connectionId: input.connectionId,
          projectId: input.projectId,
          correlationId: input.attribution.context.correlationId,
          measurementStatus: "unknown",
          id: { notIn: [...inFlight] },
        },
      });
      if (unresolved)
        throw new ProviderUsagePersistenceError({ phase: "admission", attemptId: unresolved.id });
      const id = randomUUID();
      await recordProviderUsage(db, {
        ...input,
        id,
        costCents: 0,
        failed: false,
        measurementStatus: "unknown",
      });
      await beginUsageEntry(id, input.estimate ?? { cents: "0", units: "1" }, input.queued);
      started += 1;
      inFlight.add(id);
      return id;
    } catch (cause) {
      throw new ProviderUsagePersistenceError({
        cause,
        phase: "admission",
        attemptId: cause instanceof ProviderUsagePersistenceError ? cause.attemptId : undefined,
      });
    }
  }

  async function settle(id: string, receipt: ProviderUsageReceipt) {
    for (const value of [receipt.costCents, receipt.quantity]) {
      if (value !== null && (!Number.isFinite(value) || value < 0))
        throw new RangeError("Provider usage receipt must be nonnegative.");
    }
    const measured = input.unit === "cents" ? receipt.costCents : receipt.quantity;
    const providerRequestId = receipt.cached ? undefined : receipt.providerRequestId;
    const duplicate = await db.$transaction(async (tx) => {
      if (providerRequestId) {
        const existing = await tx.providerCostEntry.findFirst({
          select: { id: true, measurementStatus: true },
          where: { connectionId: input.connectionId, providerRequestId, id: { not: id } },
        });
        if (existing) {
          if (existing.measurementStatus === "unknown" && measured !== null) {
            await tx.providerCostEntry.update({
              where: { id: existing.id },
              data: {
                cached: receipt.cached,
                costCents: receipt.costCents ?? 0,
                failed: receipt.failed,
                measurementStatus: "recorded",
                usageQuantity: receipt.quantity,
              },
            });
          }
          await tx.providerCostEntry.deleteMany({ where: { id, measurementStatus: "unknown" } });
          return existing.id;
        }
      }
      await tx.providerCostEntry.update({
        where: { id },
        data: {
          cached: receipt.cached,
          costCents: receipt.costCents ?? 0,
          failed: receipt.failed,
          measurementStatus: measured === null ? "unknown" : "recorded",
          providerRequestId,
          usageQuantity: receipt.quantity,
        },
      });
      return null;
    });
    await syncUsageEntry(duplicate ?? id);
    if (duplicate) await recordUnchargedEvidence(id);
    if (!duplicate) {
      measurements.set(id, receipt);
      const receipts = [...measurements.values()];
      quantity = receipts.some((item) => item.quantity === null)
        ? null
        : receipts.reduce((sum, item) => sum + (item.quantity ?? 0), 0);
      costCents = receipts.some((item) => item.costCents === null)
        ? null
        : receipts.reduce((sum, item) => sum + (item.costCents ?? 0), 0);
    }
  }

  return {
    observer,
    get started() {
      return started > 0;
    },
    get quantity() {
      return quantity;
    },
    get costCents() {
      return costCents;
    },
  };
}
