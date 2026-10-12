import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import {
  BudgetExhaustedError,
  ProviderAllocationExhaustedError,
} from "@/lib/metering/admission-errors";
import { ProviderCostLimitError } from "@/lib/providers/cost-limit";
import { DeploymentAdmissionExhaustedError } from "@/lib/providers/execution-extension-errors";
import {
  type ProviderUsageObserver,
  ProviderUsagePersistenceError,
  type ProviderUsageReceipt,
} from "@/lib/providers/usage";
import { formatQuantity } from "@usagekit/core";
import type { ProviderRequest } from "@usagekit/providers";
import { type OwnAttemptGrant, ownAdmission } from "./admission-extension";
import { captureByokEvidence, discardByokEvidence, recordByokEvidence } from "./byok-evidence";
import { type RequestCostLimit, requestCostLimit } from "./request-cost-limit";
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
  maxCostCents?: number;
  costLimit?: RequestCostLimit;
};

export function createProviderRequestJournal(db: PrismaClient, input: JournalInput) {
  const consent = input.costLimit ?? requestCostLimit(input.maxCostCents);
  let started = 0;
  let quantity: number | null = 0;
  let costCents: number | null = 0;
  const measurements = new Map<string, ProviderUsageReceipt>();
  const inFlight = new Set<string>();
  const grants = new Map<string, OwnAttemptGrant>();
  const observer: ProviderUsageObserver = {
    async prepare(attempt) {
      const next = consent.admit(() => begin(attempt.attemptKey, attempt.request));
      const attemptId = await next;
      const request = grants.get(attemptId)?.pricedRequest;
      if (!request) throw new Error("Priced request grant is unavailable");
      return { attemptId, request };
    },
    async begin(attempt) {
      const next = consent.admit(() => begin(attempt?.attemptKey));
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
        consent.settle(id, null);
        throw new ProviderUsagePersistenceError({ cause, phase: "settlement", attemptId: id });
      } finally {
        inFlight.delete(id);
      }
    },
    async beforeDispatch(id) {
      const grant = grants.get(id);
      if (!grant) throw new Error("Paid transport grant is unavailable");
      await ownAdmission.fence(db, [grant]);
    },
    async cancel(id) {
      await db.$transaction(async (tx) => {
        await ownAdmission.cancel(tx, [id]);
        await discardByokEvidence(tx, [id]);
      });
      consent.cancel(id);
      inFlight.delete(id);
    },
  };

  async function begin(attemptKey?: string, providerRequest?: ProviderRequest) {
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
      const unresolved = await db.meteringUsageEvidence.findFirst({
        ...query,
        where: { ...query.where, discarded: false },
      });
      if (unresolved)
        throw new ProviderUsagePersistenceError({ phase: "admission", attemptId: unresolved.id });
      const reserved = await db.$transaction(async (tx) => {
        await captureByokEvidence(tx, input, id);
        const lockedQuery = {
          ...query,
          where: { ...query.where, id: { notIn: [...inFlight, id] } },
        };
        const pending = await tx.meteringUsageEvidence.findFirst({
          ...lockedQuery,
          where: { ...lockedQuery.where, discarded: false },
        });
        if (pending)
          throw new ProviderUsagePersistenceError({ phase: "admission", attemptId: pending.id });
        return ownAdmission.reserve(tx, [
          {
            id,
            credentialVersion: input.credentialVersion ?? null,
            queued: input.queued,
            ...(providerRequest ? { providerRequest } : {}),
            maxCostCents: consent.remaining(),
            attribution: {
              tag: input.attribution.tag,
              trigger: input.attribution.context.trigger,
              ...(input.keywordId ? { keywordId: input.keywordId } : {}),
            },
          },
        ]);
      });
      // Publish consent only after commit; a failed replay must retain the original hold.
      for (const grant of reserved) {
        grants.set(id, grant);
        consent.reserve(id, grant.pricedRequest?.estimate, input.estimate?.cents ?? "0");
      }
      started += 1;
      inFlight.add(id);
      return id;
    } catch (cause) {
      if (
        cause instanceof ProviderCostLimitError ||
        cause instanceof DeploymentAdmissionExhaustedError ||
        cause instanceof BudgetExhaustedError ||
        cause instanceof ProviderAllocationExhaustedError
      )
        throw cause;
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
    const providerRequestId = receipt.cached ? undefined : receipt.providerRequestId;
    const duplicate = await db.$transaction(async (tx) => {
      if (providerRequestId) {
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${JSON.stringify(["own-native", input.connectionId, providerRequestId])},0))`;
        const retained = await tx.meteringUsageEvidence.findFirst({
          where: {
            connectionId: input.connectionId,
            providerRequestId,
            id: { not: id },
          },
        });
        const canonical = retained?.canonicalId ?? retained?.id;
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
          await recordByokEvidence(tx, id, receipt, canonical);
          return canonical;
        }
      }
      await recordByokEvidence(tx, id, receipt, null);
      return null;
    });
    const budget = grants.get(id)?.pricedRequest?.estimate.find((q) => q.unit === "budget_cents");
    const valued =
      input.provider === "serpapi" && budget
        ? receipt.quantity === null
          ? null
          : new Prisma.Decimal(formatQuantity(budget)).times(receipt.quantity).toNumber()
        : receipt.costCents;
    consent.settle(id, duplicate ? 0 : valued);
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
