import "server-only";
import { actionPaymentAvailability } from "@/lib/action-payment/availability";
import type { AcceptedActionPayment, ActionPaymentQuote } from "@/lib/action-payment/contract";
import { sealActionPaymentConsent } from "@/lib/action-payment/durable-consent";
import { resolveProviderPayment } from "@/lib/action-payment/provider-descriptor";
import { notApplicablePaymentCache } from "@/lib/action-payment/quote-cache";
import {
  ActionPaymentError,
  createPaymentToken,
  paymentFingerprint,
  readPaymentToken,
} from "@/lib/action-payment/token";
import { pagesPerCheck } from "@/lib/cost-estimate/estimate";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { getSerpProvider } from "@/lib/providers/registry";
import type { loadSerpProviderChain } from "@/lib/rank-check/provider-chain-loader";
import type { SerpDepth } from "@/lib/serp/constants";
import { quoteRankPayment } from "./payment-deployment";
import { rankPaymentOptions } from "./payment-sources";

type Connection = Awaited<ReturnType<typeof loadSerpProviderChain>>[number];
export async function prepareRankPayment(
  input: {
    actorId?: string | null;
    projectId: string;
    source: string;
    sourceHash: string;
    selectionHash: string;
    connection: Connection;
    targets: readonly { keywordId: string; cost: number | null; depth: SerpDepth }[];
    acceptedPayment?: AcceptedActionPayment;
    requirePayment?: boolean;
  },
  tx: Prisma.TransactionClient = prisma,
) {
  const option = rankPaymentOptions([input.connection])[0];
  if (!option) {
    if (input.acceptedPayment || input.requirePayment)
      throw new ActionPaymentError("payment_unavailable");
    return null;
  }
  const owner = await tx.project.findUnique({
    where: { id: input.projectId },
    select: { ownerId: true },
  });
  if (!owner) throw new ActionPaymentError("payment_unavailable");
  const descriptor = resolveProviderPayment(
    getSerpProvider(input.connection.provider),
    "rank_check",
  );
  if (!descriptor) throw new ActionPaymentError("payment_unavailable");
  if (
    descriptor.basis === "provider_cost" &&
    (descriptor.unit.kind !== "currency" || descriptor.unit.code !== "USD")
  )
    throw new ActionPaymentError("payment_unavailable");
  const targets = [...input.targets]
    .sort((a, b) => a.keywordId.localeCompare(b.keywordId))
    .map((target) => {
      const native =
        descriptor.basis === "provider_quantity"
          ? descriptor.estimateQuantity?.("rank_check", pagesPerCheck(target.depth))
          : "1";
      if (native == null || target.cost === null)
        throw new ActionPaymentError("payment_unavailable");
      return { ...target, quantity: native };
    });
  const policy =
    option.fundingSource === "platform"
      ? await quoteRankPayment(
          option.providerId,
          targets.map((target) => ({ ...target, quantity: Number(target.quantity) })),
          tx,
        )
      : null;
  if (option.fundingSource === "platform" && !policy)
    throw new ActionPaymentError("payment_unavailable");
  if (
    option.fundingSource === "platform" &&
    targets.some((target) => policy?.prices[target.keywordId] == null)
  )
    throw new ActionPaymentError("payment_unavailable");
  const route = paymentFingerprint([
    input.projectId,
    owner.ownerId,
    input.connection.id,
    input.connection.credentialSource,
    input.connection.credentialsEncrypted,
    input.connection.updatedAt?.toISOString(),
    option,
  ]);
  const request = paymentFingerprint([
    "rank_check",
    input.projectId,
    input.actorId ?? null,
    input.source,
    input.selectionHash,
    input.sourceHash,
  ]);
  const children = Object.fromEntries(
    targets.map((target) => [
      paymentFingerprint(target.keywordId),
      {
        free: false,
        authority: policy?.authority ?? "",
        amount:
          option.fundingSource === "platform"
            ? policy!.prices[target.keywordId]
            : descriptor.basis === "provider_quantity"
              ? target.quantity
              : new Prisma.Decimal(target.cost ?? 0).div(100).toFixed(),
        providerCostCents: String(target.cost),
        nativeQuantity: descriptor.basis === "provider_quantity" ? target.quantity : null,
      },
    ]),
  );
  const accepted = input.acceptedPayment
    ? readPaymentToken(input.acceptedPayment.quoteToken)
    : null;
  const amount = Object.values(children)
    .reduce((sum, child) => sum.plus(child.amount), new Prisma.Decimal(0))
    .toFixed();
  // The browser signs one aggregate; the complete vector is retained only in server-owned JSON.
  const aggregate = {
    rank: {
      free: false,
      authority: paymentFingerprint(children),
      amount,
      providerCostCents: targets
        .reduce((sum, target) => sum.plus(target.cost ?? 0), new Prisma.Decimal(0))
        .toFixed(),
      nativeQuantity:
        descriptor.basis === "provider_quantity"
          ? targets
              .reduce((sum, target) => sum.plus(target.quantity), new Prisma.Decimal(0))
              .toFixed()
          : null,
    },
  };
  if (
    accepted &&
    (accepted.route !== route ||
      accepted.request !== request ||
      JSON.stringify(accepted.children) !== JSON.stringify(aggregate))
  )
    throw new ActionPaymentError("payment_quote_changed");
  const signed =
    accepted && input.acceptedPayment
      ? { payload: accepted, token: input.acceptedPayment.quoteToken }
      : createPaymentToken({
          route,
          request,
          children: aggregate,
          scope: paymentFingerprint([input.projectId, input.actorId ?? null]),
          source: input.source,
          option,
        });
  const quote: ActionPaymentQuote = {
    id: signed.payload.id,
    quoteToken: signed.token,
    expiresAt: new Date(signed.payload.exp * 1000).toISOString(),
    option,
    charge: {
      value: amount,
      unit: option.payableUnit,
      certainty: targets.length ? "estimate" : "free",
    },
    cache: notApplicablePaymentCache(),
    availability: { allowed: true, reason: null },
  };
  Object.assign(
    quote,
    await actionPaymentAvailability({
      quote,
      projectId: input.projectId,
      actorId: input.actorId,
      connectionId: input.connection.id ?? "",
      provider: option.providerId,
      source: input.source,
      providerCostCents: targets.reduce((sum, target) => sum + (target.cost ?? 0), 0),
      nativeQuantity:
        descriptor.basis === "provider_quantity"
          ? targets.reduce((sum, target) => sum + Number(target.quantity), 0)
          : undefined,
    }),
  );
  return {
    quote,
    retain(runPublicId: string) {
      if (!accepted) throw new ActionPaymentError("payment_quote_required");
      if (!quote.availability.allowed) throw new ActionPaymentError("payment_unavailable");
      return sealActionPaymentConsent({
        version: 1,
        runPublicId,
        projectId: input.projectId,
        ownerId: owner.ownerId,
        actorId: input.actorId ?? null,
        source: input.source,
        quoteId: accepted.id,
        option,
        route,
        connectionId: input.connection.id,
        connectionRevision: input.connection.updatedAt?.toISOString() ?? null,
        credentialFingerprint: paymentFingerprint(input.connection.credentialsEncrypted),
        authority: policy?.authority ?? "",
        targets: targets.map((target) => ({
          ...target,
          amount: children[paymentFingerprint(target.keywordId)].amount,
        })),
      });
    },
  };
}
