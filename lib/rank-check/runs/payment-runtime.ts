import "server-only";
import { readActionPaymentConsent } from "@/lib/action-payment/durable-consent";
import { actionPaymentOption } from "@/lib/action-payment/options";
import type { PaidCallPayment } from "@/lib/action-payment/paid-call";
import { ActionPaymentError, paymentFingerprint } from "@/lib/action-payment/token";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import { requestCostLimit } from "@/lib/provider-usage/request-cost-limit";
import { getSerpProvider } from "@/lib/providers/registry";
import type { RankCheckConnectionInput } from "@/lib/rank-check/runner-input";
import { retainedRankPaymentSchema } from "./payment-contract";
import { quoteRankPayment } from "./payment-deployment";

type Client = Pick<Prisma.TransactionClient, "$queryRaw" | "providerConnection">;
type Row = {
  projectId: string;
  ownerId: string;
  publicId: string;
  keywordId: string;
  depth: number | null;
  spec: unknown;
};
export async function retainedRankPayment(checkId: string, db: Client = prisma) {
  const [row] = await db.$queryRaw<
    Row[]
  >`SELECT r."projectId", p."ownerId", r."publicId", i."keywordId", c."requestedDepth" AS depth, r."selectionSpec" AS spec
    FROM rank_checks c JOIN rank_check_run_items i ON i."rankCheckId"=c.id
    JOIN rank_check_runs r ON r.id=i."runId" AND c."runId"=r.id
    JOIN projects p ON p.id=r."projectId" WHERE c.id=${checkId}`;
  const sealed = (row?.spec as Record<string, unknown> | null)?.rankPaymentConsent;
  if (!sealed) return null;
  const consent = readActionPaymentConsent(sealed, retainedRankPaymentSchema);
  const target = consent.targets.find((item) => item.keywordId === row.keywordId);
  if (
    consent.projectId !== row.projectId ||
    consent.runPublicId !== row.publicId ||
    consent.ownerId !== row.ownerId ||
    !target ||
    (row.depth !== null && row.depth !== target.depth)
  )
    throw new ActionPaymentError("payment_quote_changed");
  return { consent, target };
}
/** Called inside existing native admission locks before reserve and again at the paid fence. */
export async function assertRankPaymentForCheck(
  tx: Prisma.TransactionClient,
  checkId: string,
  connectionId: string,
  priceCents?: string,
) {
  const retained = await retainedRankPayment(checkId, tx);
  if (!retained) return null;
  const { consent, target } = retained;
  const connection = await tx.providerConnection.findUnique({
    where: { id: connectionId },
    select: {
      id: true,
      projectId: true,
      publicId: true,
      provider: true,
      credentialSource: true,
      credentialsEncrypted: true,
      updatedAt: true,
      enabled: true,
      status: true,
    },
  });
  if (
    !connection ||
    connection.id !== consent.connectionId ||
    connection.projectId !== consent.projectId ||
    connection.publicId !== consent.option.connectionId ||
    connection.provider !== consent.option.providerId ||
    !connection.enabled ||
    connection.status !== "connected" ||
    connection.credentialSource !==
      (consent.option.fundingSource === "platform" ? "hosted" : "own") ||
    connection.updatedAt.toISOString() !== consent.connectionRevision ||
    paymentFingerprint(connection.credentialsEncrypted) !== consent.credentialFingerprint
  )
    throw new ActionPaymentError("payment_quote_changed");
  const option = actionPaymentOption(
    {
      connection: {
        publicId: connection.publicId,
        credentialSource: connection.credentialSource as "own" | "hosted",
      },
      provider: getSerpProvider(connection.provider),
    },
    "rank_check",
  );
  if (option?.id !== consent.option.id) throw new ActionPaymentError("payment_quote_changed");
  if (consent.option.fundingSource === "platform") {
    const policy = await quoteRankPayment(
      consent.option.providerId,
      [{ ...target, quantity: Number(target.quantity) }],
      tx,
    );
    if (
      !policy ||
      policy.authority !== consent.authority ||
      policy.prices[target.keywordId] !== target.amount ||
      (priceCents !== undefined && new Prisma.Decimal(priceCents).gt(target.amount))
    )
      throw new ActionPaymentError("payment_quote_changed");
  }
  return retained;
}
export async function rankPaymentExecution(
  checkId: string,
  connections: RankCheckConnectionInput[],
  projectId?: string,
) {
  const retained = await retainedRankPayment(checkId);
  if (!retained) return { connections, payment: undefined };
  const { consent, target } = retained;
  if (projectId !== consent.projectId) throw new ActionPaymentError("payment_quote_changed");
  const selected = connections.find((connection) => connection.id === consent.connectionId);
  if (!selected) throw new ActionPaymentError("payment_quote_changed");
  const amount =
    consent.option.fundingSource === "platform"
      ? Number(target.amount)
      : consent.option.payableUnit.kind === "currency"
        ? new Prisma.Decimal(target.amount).times(100).toNumber()
        : undefined;
  const payment: PaidCallPayment = {
    operationKey: `rank-check:${checkId}`,
    connectionId: consent.connectionId,
    snapshot: {
      credentialSource: consent.option.fundingSource === "platform" ? "hosted" : "own",
      credentialsEncrypted: selected.credentialsEncrypted ?? null,
    },
    costLimit: amount === undefined ? undefined : requestCostLimit(amount),
    guard: {
      async lockBusiness(tx) {
        await lockProjectForProviderMutation(tx, consent.projectId);
        await tx.$queryRaw`SELECT id FROM provider_connections WHERE id=${consent.connectionId} FOR UPDATE`;
      },
      async assertRequest(tx) {
        await assertRankPaymentForCheck(tx, checkId, consent.connectionId);
      },
    },
    async record() {
      /* Actual history reads the existing immutable journal by check identity. */
    },
  };
  return { connections: [selected], payment };
}
