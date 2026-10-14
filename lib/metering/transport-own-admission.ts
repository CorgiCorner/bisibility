import { readPaidFenceReference } from "./paid-fence-references";
import { rankAttribution } from "./rank-attribution";
import "server-only";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import type {
  OwnAttemptGrant,
  OwnAttemptInput,
} from "@/lib/provider-usage/admission-extension-types";
import { loadByokEvidence } from "@/lib/provider-usage/byok-evidence-storage";
import { assertProviderCostLimit } from "@/lib/providers/cost-limit";
import { translatePaidAdmission } from "./admission-errors";
import { reserveFromEntry } from "./mapping";
import { reservePaidAttempts } from "./paid-admission";
import type { PaidFenceHook } from "./paid-attempt-types";
import { PaidAttemptAdmissionError } from "./paid-attempt-types";
import { fencePaidAttemptsInTransaction, markPaidAttemptDispatch } from "./paid-dispatch";
import { reserveOwnPricedRequests } from "./priced-own-request";
import { createTransactionMeter } from "./transaction-meter";

export async function reserveOwnTransports(
  tx: Prisma.TransactionClient,
  inputs: readonly OwnAttemptInput[],
) {
  const requests = await Promise.all(
    inputs.map(async (input) => {
      const entry = await loadByokEvidence(tx, input.id);
      const journal = await tx.meteringUsageEvidence.findUniqueOrThrow({ where: { id: input.id } });
      if (
        !entry?.namespace ||
        !entry.publicConnectionId ||
        !input.credentialVersion ||
        entry.providerCredentialVersion !== input.credentialVersion
      )
        throw new Error("Original own-key admission binding is unavailable");
      const reservation = reserveFromEntry(
        entry.namespace,
        entry,
        journal.estimate as { cents: string; units: string },
      );
      const attribution = input.attribution;
      const rank =
        entry.feature === "rank_check"
          ? await rankAttribution(tx, entry.projectId, journal.correlationId)
          : {};
      reservation.estimateSource = "list";
      reservation.reservationTtlMs = input.queued ? 86400000 : 3600000;
      return {
        reservation,
        context: {
          feature: entry.feature,
          projectId: entry.projectId,
          connectionId: entry.connectionId,
          publicConnectionId: entry.publicConnectionId,
          providerCredentialVersion: input.credentialVersion,
          correlationId: journal.correlationId,
          ...rank,
          ...(attribution?.tag ? { tag: attribution?.tag } : {}),
          ...(attribution?.trigger ? { trigger: attribution?.trigger } : {}),
          ...(attribution?.keywordId ? { keywordId: attribution?.keywordId } : {}),
        },
      };
    }),
  );
  try {
    const hasPricedRequests = inputs.some((input) => input.providerRequest);
    if (hasPricedRequests && inputs.some((input) => !input.providerRequest))
      throw new Error("Priced tasksets require all immutable child requests");
    const priced = hasPricedRequests
      ? await reserveOwnPricedRequests(
          tx,
          await createTransactionMeter(tx),
          requests.map((request, index) => {
            const providerRequest = inputs[index]?.providerRequest;
            if (!providerRequest) throw new Error("Missing taskset request");
            return {
              ...request,
              request: providerRequest,
              maxCostCents: inputs[index]?.maxCostCents,
            };
          }),
        )
      : undefined;
    if (!priced)
      for (const [index, request] of requests.entries())
        assertProviderCostLimit(request.reservation.estimate, inputs[index]?.maxCostCents);
    const reservations = priced
      ? priced.map((result) => result.reservation)
      : await reservePaidAttempts(tx, requests);
    const grants = [];
    for (const reservation of reservations)
      grants.push(
        await markPaidAttemptDispatch(tx, reservation, `own:${reservation.operation.operationId}`),
      );
    return grants.map((grant, index) => ({
      attemptId: grant.operation.operationId,
      leaseId: grant.lease.leaseId,
      ...(priced ? { pricedRequest: priced[index]?.priced } : {}),
    }));
  } catch (error) {
    if (error instanceof PaidAttemptAdmissionError) {
      throw translatePaidAdmission(error);
    }
    throw error;
  }
}

export async function ownTransportRef(tx: Prisma.TransactionClient, id: string) {
  const entry = await loadByokEvidence(tx, id);
  if (!entry?.namespace) throw new Error("Retained own-key identity is unavailable");
  return { namespace: entry.namespace, principal: entry.ownerId, operationId: id };
}
export async function fenceOwnTransports(
  db: PrismaClient,
  grants: readonly OwnAttemptGrant[],
  beforeFence?: PaidFenceHook,
) {
  if (!grants.length) throw new Error("Paid transport requires a complete grant set");
  await db.$transaction(async (tx) => {
    const paid = [];
    for (const grant of grants) {
      const { operation } = await readPaidFenceReference(
        tx,
        await ownTransportRef(tx, grant.attemptId),
      );
      if (!operation.lease || operation.lease.leaseId !== grant.leaseId)
        throw new Error("Own-key transport is fenced out");
      paid.push({ operation, lease: operation.lease });
    }
    await fencePaidAttemptsInTransaction(tx, paid, { beforeFence });
  });
}
