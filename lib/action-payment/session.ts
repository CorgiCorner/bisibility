import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@/lib/generated/prisma/client";
import { requestCostLimit } from "@/lib/provider-usage/request-cost-limit";
import type { SerpProvider } from "@/lib/providers/types";
import { actionPaymentGuard } from "./admission-guard";
import { actionPaymentAvailability } from "./availability";
import { currentChildAmount } from "./child-scope";
import type { AcceptedActionPayment, ActionPaymentQuote } from "./contract";
import { quoteDeploymentPayment } from "./deployment-extension";
import { actionPaymentOption } from "./options";
import type { PaidCallPayment, PaymentPart } from "./paid-call";
import { resolveProviderPayment } from "./provider-descriptor";
import { actionPaymentCache } from "./quote-cache";
import { actionPaymentReceipt, readPaymentPart } from "./receipt";
import {
  ActionPaymentError,
  createPaymentToken,
  paymentFingerprint,
  readPaymentToken,
} from "./token";

export type ActionPaymentInput = {
  paymentOptionId?: string;
  acceptedPayment?: AcceptedActionPayment;
  requirePayment?: boolean;
};
type Connection = {
  id: string;
  publicId: string;
  provider: string;
  credentialSource?: "own" | "hosted";
  credentialsEncrypted: string | null;
  updatedAt?: Date;
};
export type PaymentChild = {
  key: string;
  costCents: number;
  quantity: number;
  cached: boolean;
  freeUntil?: string;
  payableItems?: string[];
};
type Input = ActionPaymentInput & {
  actorId?: string | null;
  projectId: string;
  ownerId?: string;
  source: string;
  feature: string;
  lookupCacheTtlSeconds?: number | null;
  request: unknown;
  connection: Connection;
  provider: SerpProvider;
  children: PaymentChild[];
  maxCostCents?: number;
};
export async function prepareActionPayment(requestInput: Input) {
  const input = {
    ...requestInput,
    connection: { ...requestInput.connection },
    provider: { ...requestInput.provider },
    children: requestInput.children.map((child) => ({
      ...child,
      payableItems: child.payableItems?.slice(),
    })),
    request: structuredClone(requestInput.request),
  };
  const resolved = resolveProviderPayment(input.provider, input.feature);
  const descriptor = resolved ? { ...resolved, unit: { ...resolved.unit } } : null;
  if (!descriptor || !input.connection.credentialSource) {
    if (input.requirePayment || input.acceptedPayment)
      throw new ActionPaymentError("payment_unavailable");
    return null;
  }
  if (
    descriptor.basis === "provider_cost" &&
    (descriptor.unit.kind !== "currency" || descriptor.unit.code !== "USD")
  )
    throw new ActionPaymentError("payment_unavailable");
  const source = input.connection.credentialSource;
  const ownerId = input.ownerId;
  if (!ownerId) throw new ActionPaymentError("payment_unavailable");
  const option = actionPaymentOption(input, input.feature);
  if (!option) throw new ActionPaymentError("payment_unavailable");
  if (input.paymentOptionId && input.paymentOptionId !== option.id)
    throw new ActionPaymentError("payment_quote_changed");
  const request = paymentFingerprint([
    input.projectId,
    input.actorId ?? null,
    input.source,
    input.feature,
    input.request,
  ]);
  const route = paymentFingerprint([
    input.projectId,
    ownerId,
    input.connection.id,
    source,
    input.connection.credentialsEncrypted,
    option,
  ]);
  const accepted = input.acceptedPayment
    ? readPaymentToken(input.acceptedPayment.quoteToken)
    : null;
  if (accepted && (accepted.request !== request || accepted.route !== route))
    throw new ActionPaymentError("payment_quote_changed");
  const id = accepted?.id ?? randomUUID();
  const operationKey = (key: string) => `payment:${id}:${paymentFingerprint(key).slice(0, 24)}`;
  const children: Record<
    string,
    {
      free: boolean;
      authority: string;
      amount: string;
      providerCostCents: string;
      nativeQuantity: string | null;
      items?: string[];
    }
  > = {};
  for (const child of input.children) {
    if (
      !Number.isFinite(child.costCents) ||
      child.costCents < 0 ||
      !Number.isFinite(child.quantity) ||
      child.quantity < 0
    )
      throw new ActionPaymentError("payment_unavailable");
    const slot = paymentFingerprint(child.key);
    const deployed =
      source === "hosted" && !child.cached
        ? await quoteDeploymentPayment({
            projectId: input.projectId,
            connectionId: input.connection.id,
            provider: input.provider.id,
            feature: input.feature,
            operationKey: operationKey(child.key),
            estimatedCostCents: new Prisma.Decimal(child.costCents).toFixed(),
            quantity: String(child.quantity),
          })
        : null;
    const native =
      descriptor.basis === "provider_cost"
        ? new Prisma.Decimal(child.costCents).div(100).toFixed()
        : descriptor.estimateQuantity?.(input.feature, child.quantity);
    if (!child.cached && source === "hosted" && !deployed)
      throw new ActionPaymentError("payment_unavailable");
    if (!child.cached && source === "own" && native == null)
      throw new ActionPaymentError("payment_unavailable");
    const amount = child.cached ? "0" : source === "hosted" ? deployed?.amount : native;
    if (amount == null) throw new ActionPaymentError("payment_unavailable");
    children[slot] = {
      free: child.cached,
      items: child.payableItems,
      authority: deployed?.authority ?? "",
      amount,
      providerCostCents: String(child.cached ? 0 : child.costCents),
      nativeQuantity: child.cached
        ? "0"
        : (descriptor.estimateQuantity?.(input.feature, child.quantity) ?? null),
    };
  }
  const acceptedToken = input.acceptedPayment?.quoteToken;
  const signed =
    accepted && acceptedToken
      ? { payload: accepted, token: acceptedToken }
      : createPaymentToken(
          {
            request,
            route,
            children,
            scope: paymentFingerprint([input.projectId, input.actorId ?? null]),
            source: input.source,
            option,
          },
          new Date(),
          id,
        );
  const allFree = input.children.every((child) => child.cached);
  const quote: ActionPaymentQuote = {
    id,
    quoteToken: signed.token,
    expiresAt: new Date(signed.payload.exp * 1000).toISOString(),
    option,
    charge: {
      value: allFree
        ? "0"
        : Object.entries(signed.payload.children)
            .reduce(
              (sum, [key, child]) => sum.plus(currentChildAmount(child, children[key])),
              new Prisma.Decimal(0),
            )
            .toFixed(),
      unit: option.payableUnit,
      certainty: allFree ? "free" : "estimate",
    },
    cache: actionPaymentCache(input),
    availability: { allowed: true, reason: null },
  };
  const parts: PaymentPart[] = [];
  Object.assign(
    quote,
    await actionPaymentAvailability({
      quote,
      projectId: input.projectId,
      actorId: input.actorId,
      connectionId: input.connection.id,
      provider: input.provider.id,
      source: input.source,
      providerCostCents: input.children
        .filter((child) => !child.cached)
        .reduce((sum, child) => sum + child.costCents, 0),
      nativeQuantity: Object.values(children).every((child) => child.nativeQuantity !== null)
        ? Object.values(children)
            .reduce((sum, child) => sum.plus(child.nativeQuantity ?? 0), new Prisma.Decimal(0))
            .toNumber()
        : undefined,
    }),
  );
  const acceptedAmount = Object.values(signed.payload.children).reduce(
    (sum, child) => sum.plus(child.amount),
    new Prisma.Decimal(0),
  );
  const acceptedCents = acceptedAmount.times(source === "own" ? 100 : 1).toNumber();
  const limit =
    source === "own" && descriptor.basis === "provider_quantity"
      ? undefined
      : requestCostLimit(
          source === "hosted"
            ? acceptedCents
            : Math.min(acceptedCents, input.maxCostCents ?? acceptedCents),
        );
  return {
    quote,
    options: [option],
    receipt: () =>
      actionPaymentReceipt(
        id,
        option,
        parts,
        parts.some((part) => part.attempted),
      ),
    get hasAttempted() {
      return parts.some((part) => part.attempted);
    },
    child(key: string): PaidCallPayment | undefined {
      if (input.requirePayment && !quote.availability.allowed)
        throw new ActionPaymentError("payment_unavailable");
      if (!accepted && input.requirePayment) throw new ActionPaymentError("payment_quote_required");
      const child = signed.payload.children[paymentFingerprint(key)];
      if (!child || child.free) throw new ActionPaymentError("payment_quote_changed");
      const op = operationKey(key);
      return {
        operationKey: op,
        connectionId: input.connection.id,
        snapshot: {
          credentialSource: source,
          credentialsEncrypted: input.connection.credentialsEncrypted,
        },
        costLimit: limit,
        guard: actionPaymentGuard({
          token: signed.token,
          projectId: input.projectId,
          ownerId,
          source,
          connection: input.connection,
          operationKey: op,
          authority: child.authority,
        }),
        record: async (ref) => {
          try {
            parts.push(await readPaymentPart(option, descriptor, ref));
          } catch {
            parts.push({
              attempted: true,
              charge: { value: null, unit: option.payableUnit, certainty: "unknown" },
            });
          }
        },
      };
    },
  };
}
export function paymentFailure(error: unknown) {
  let cause = error;
  for (let index = 0; index < 6; index++) {
    if (cause instanceof ActionPaymentError) return { ok: false as const, reason: cause.reason };
    if (!cause || typeof cause !== "object" || !("cause" in cause)) break;
    cause = cause.cause;
  }
  return null;
}
