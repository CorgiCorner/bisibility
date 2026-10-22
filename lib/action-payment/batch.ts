import "server-only";
import { Prisma } from "@/lib/generated/prisma/client";
import { actionPaymentAvailability } from "./availability";
import type { ActionPaymentBatchAssessment, PaymentAmount } from "./contract";
import { currentPaymentRoute } from "./current-route";
import { readDeploymentPaymentAvailability } from "./deployment-extension";
import { notApplicablePaymentCache } from "./quote-cache";
import { ActionPaymentError, paymentFingerprint, readPaymentToken } from "./token";

export type { ActionPaymentBatchAssessment } from "./contract";
export async function assessActionPayments(input: {
  projectId: string;
  actorId: string;
  quotes: { quoteToken: string }[];
}): Promise<ActionPaymentBatchAssessment> {
  if (!input.quotes.length || input.quotes.length > 50)
    throw new ActionPaymentError("payment_quote_changed");
  const payloads = input.quotes.map((quote) => readPaymentToken(quote.quoteToken));
  const scope = paymentFingerprint([input.projectId, input.actorId]);
  if (
    payloads.some((payload) => payload.scope !== scope || payload.source !== "app") ||
    new Set(payloads.map((payload) => payload.id)).size !== payloads.length
  )
    throw new ActionPaymentError("payment_quote_changed");
  const groups = new Map<string, PaymentAmount>();
  const routePlans = new Map<
    string,
    {
      payload: (typeof payloads)[number];
      connection: Awaited<ReturnType<typeof currentPaymentRoute>>;
      amount: Prisma.Decimal;
      providerCost: Prisma.Decimal;
      native: Prisma.Decimal | null;
    }
  >();
  let platform = new Prisma.Decimal(0);
  let denial: ActionPaymentBatchAssessment | null = null;
  for (const payload of payloads) {
    const connection = await currentPaymentRoute(input.projectId, payload);
    const amount = Object.values(payload.children).reduce(
      (sum, child) => sum.plus(child.amount),
      new Prisma.Decimal(0),
    );
    const key = JSON.stringify([payload.option.fundingSource, payload.option.payableUnit]);
    const prior = groups.get(key);
    const total = new Prisma.Decimal(prior?.value ?? 0).plus(amount);
    groups.set(key, {
      value: total.toFixed(),
      unit: payload.option.payableUnit,
      certainty: total.isZero() ? "free" : "estimate",
    });
    if (payload.option.fundingSource === "platform") platform = platform.plus(amount);
    const children = Object.values(payload.children);
    const routeKey = JSON.stringify([connection.id, payload.option.payableUnit]);
    const priorPlan = routePlans.get(routeKey);
    const native = children.every((child) => child.nativeQuantity !== null)
      ? children.reduce((sum, child) => sum.plus(child.nativeQuantity ?? 0), new Prisma.Decimal(0))
      : null;
    routePlans.set(routeKey, {
      payload,
      connection,
      amount: (priorPlan?.amount ?? new Prisma.Decimal(0)).plus(amount),
      providerCost: children.reduce(
        (sum, child) => sum.plus(child.providerCostCents),
        priorPlan?.providerCost ?? new Prisma.Decimal(0),
      ),
      native:
        native === null || priorPlan?.native === null
          ? null
          : (priorPlan?.native ?? new Prisma.Decimal(0)).plus(native),
    });
  }
  for (const plan of routePlans.values()) {
    const { payload, connection, amount } = plan;
    const availability = await actionPaymentAvailability({
      projectId: input.projectId,
      actorId: input.actorId,
      connectionId: connection.id,
      provider: connection.provider,
      source: payload.source,
      providerCostCents: plan.providerCost.toNumber(),
      nativeQuantity: plan.native?.toNumber(),
      quote: {
        id: payload.id,
        quoteToken: "retained",
        expiresAt: new Date(payload.exp * 1000).toISOString(),
        option: payload.option,
        charge: {
          value: amount.toFixed(),
          unit: payload.option.payableUnit,
          certainty: amount.isZero() ? "free" : "estimate",
        },
        cache: notApplicablePaymentCache(),
        availability: { allowed: true, reason: null },
      },
    });
    if (
      !availability.availability.allowed &&
      availability.availability.reason !== "insufficient_credits"
    )
      denial = { ...availability.availability, charges: [] };
  }
  const availability = payloads.some((payload) => payload.option.fundingSource === "platform")
    ? await readDeploymentPaymentAvailability({
        projectId: input.projectId,
        actorId: input.actorId,
        amount: platform.toFixed(),
      })
    : { availability: { allowed: true, reason: null } };
  return {
    ...(denial ?? availability.availability),
    charges: [...groups.values()],
    ...(availability.wallet ? { wallet: availability.wallet } : {}),
  };
}
