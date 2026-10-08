import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import { beginUsageEntry, syncUsageEntry } from "@/lib/metering/entry-sync";
import { DeploymentAdmissionExhaustedError } from "@/lib/providers/execution-extension-errors";
import {
  type ProviderUsageObserver,
  ProviderUsagePersistenceError,
  type ProviderUsageReceipt,
} from "@/lib/providers/usage";
import { type OwnAttemptGrant, ownAdmission } from "./admission-extension";
import { captureByokEvidence, discardByokEvidence, recordByokEvidence } from "./byok-evidence";
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
  credentialVersion?: string | null;
};

export function createProviderRequestJournal(db: PrismaClient, input: JournalInput) {
  let started = 0;
  let quantity: number | null = 0;
  let costCents: number | null = 0;
  const measurements = new Map<string, ProviderUsageReceipt>();
  let beginQueue = Promise.resolve();
  const inFlight = new Set<string>();
  const grants = new Map<string, OwnAttemptGrant>();
  const observer: ProviderUsageObserver = {
    async begin(attempt) {
      const next = beginQueue.then(() => begin(attempt?.attemptKey));
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
    async beforeDispatch(id) {
      const grant = grants.get(id);
      if (grant) await ownAdmission.fence(db, [grant]);
    },
    async cancel(id) {
      await db.$transaction(async (tx) => {
        await ownAdmission.cancel(tx, [id]);
        await tx.providerCostEntry.deleteMany({ where: { id, measurementStatus: "unknown" } });
        await discardByokEvidence(tx, [id]);
      });
    },
  };

  async function begin(attemptKey?: string) {
    const id = attemptKey
      ? createHash("sha256")
          .update(
            JSON.stringify([
              "byok",
              input.connectionId,
              input.attribution.context.correlationId,
              attemptKey,
            ]),
          )
          .digest("hex")
      : randomUUID();
    try {
      const query = {
        select: { id: true },
        where: {
          connectionId: input.connectionId,
          projectId: input.projectId,
          correlationId: input.attribution.context.correlationId,
          measurementStatus: "unknown",
          id: { notIn: [...inFlight] },
        },
      };
      const unresolved =
        (await db.providerCostEntry.findFirst(query)) ??
        (await db.meteringUsageEvidence.findFirst({
          ...query,
          where: { ...query.where, discarded: false },
        }));
      if (unresolved)
        throw new ProviderUsagePersistenceError({ phase: "admission", attemptId: unresolved.id });
      await db.$transaction(async (tx) => {
        const evidence = await captureByokEvidence(tx, input, id);
        const lockedQuery = {
          ...query,
          where: { ...query.where, id: { notIn: [...inFlight, id] } },
        };
        const pending =
          (await tx.providerCostEntry.findFirst(lockedQuery)) ??
          (await tx.meteringUsageEvidence.findFirst({
            ...lockedQuery,
            where: { ...lockedQuery.where, discarded: false },
          }));
        if (pending)
          throw new ProviderUsagePersistenceError({ phase: "admission", attemptId: pending.id });
        await recordProviderUsage(tx, {
          ...input,
          id,
          createdAt: evidence.createdAt,
          costCents: 0,
          failed: false,
          measurementStatus: "unknown",
        });
        for (const grant of await ownAdmission.reserve(tx, [
          { id, credentialVersion: input.credentialVersion ?? null, queued: input.queued },
        ]))
          grants.set(id, grant);
      });
      await beginUsageEntry(id, input.estimate ?? { cents: "0", units: "1" }, input.queued);
      started += 1;
      inFlight.add(id);
      return id;
    } catch (cause) {
      if (cause instanceof DeploymentAdmissionExhaustedError) throw cause;
      throw new ProviderUsagePersistenceError({
        cause,
        phase: "admission",
        attemptId: cause instanceof ProviderUsagePersistenceError ? cause.attemptId : id,
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
        const retained = await tx.meteringUsageEvidence.findFirst({
          where: {
            connectionId: input.connectionId,
            providerRequestId,
            id: { not: id },
          },
        });
        const existing = await tx.providerCostEntry.findFirst({
          select: { id: true, measurementStatus: true },
          where: { connectionId: input.connectionId, providerRequestId, id: { not: id } },
        });
        const canonical = retained?.canonicalId ?? retained?.id ?? existing?.id;
        if (canonical && canonical !== id) {
          await tx.$queryRaw(
            Prisma.sql`SELECT id FROM metering_usage_evidence WHERE id IN (${Prisma.join([canonical, id])}) ORDER BY id FOR UPDATE`,
          );
          const original = await tx.meteringUsageEvidence.findUnique({ where: { id: canonical } });
          const known = original?.receipt as {
            costCents?: string | null;
            quantity?: string | null;
            cached?: boolean;
            failed?: boolean;
          } | null;
          // A duplicate may complete missing dimensions, never replace proved canonical amounts.
          const completed = {
            ...receipt,
            costCents: known?.costCents == null ? receipt.costCents : Number(known.costCents),
            quantity: known?.quantity == null ? receipt.quantity : Number(known.quantity),
            cached: known?.cached ?? receipt.cached,
            failed: known?.failed ?? receipt.failed,
          };
          const canonicalMeasured =
            input.unit === "cents" ? completed.costCents : completed.quantity;
          if (original?.measurementStatus === "unknown" && canonicalMeasured !== null)
            await recordByokEvidence(tx, canonical, completed, null);
          if (
            existing &&
            (known || existing.measurementStatus === "unknown") &&
            canonicalMeasured !== null
          ) {
            await tx.providerCostEntry.update({
              where: { id: existing.id },
              data: {
                cached: completed.cached,
                costCents: completed.costCents ?? 0,
                failed: completed.failed,
                measurementStatus: "recorded",
                usageQuantity: completed.quantity,
              },
            });
          }
          await tx.providerCostEntry.deleteMany({ where: { id, measurementStatus: "unknown" } });
          await recordByokEvidence(tx, id, receipt, canonical);
          return canonical;
        }
      }
      await recordByokEvidence(tx, id, receipt, null);
      await tx.providerCostEntry.updateMany({
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
    if (duplicate) await syncUsageEntry(id);
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
