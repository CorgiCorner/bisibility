import "server-only";
import { enumerateActionPaymentOptions } from "@/lib/action-payment/options";
import {
  type ActionPaymentInput,
  type PaymentChild,
  prepareActionPayment,
} from "@/lib/action-payment/session";
import { ActionPaymentError } from "@/lib/action-payment/token";
import type { BacklinksSource } from "./context";
import { type backlinksProject, backlinksSources } from "./context";
import type { BacklinksServiceContext } from "./types";

export type BacklinksPayment = Awaited<ReturnType<typeof prepareActionPayment>>;
export async function prepareBacklinksPayment(
  context: BacklinksServiceContext,
  options: ActionPaymentInput,
  project: NonNullable<Awaited<ReturnType<typeof backlinksProject>>>,
  source: BacklinksSource | null | undefined,
  request: unknown,
  children: PaymentChild[],
) {
  if (!source) {
    if (options.requirePayment || options.acceptedPayment || options.paymentOptionId)
      throw new ActionPaymentError("payment_unavailable");
    return null;
  }
  return prepareActionPayment({
    ...options,
    actorId: context.actorId,
    projectId: project.id,
    ownerId: project.ownerId,
    source: context.origin.source,
    feature: "backlinks",
    lookupCacheTtlSeconds: project.lookupCacheTtlSeconds,
    connection: source.connection,
    provider: source.provider,
    request,
    children,
  });
}
export function backlinksPaymentEstimate(
  payment: BacklinksPayment,
  project: Parameters<typeof backlinksSources>[0],
) {
  return payment
    ? {
        payment: payment.quote,
        paymentOptions: enumerateActionPaymentOptions(backlinksSources(project), "backlinks"),
      }
    : {};
}
export function backlinksPaymentReceipt(payment: BacklinksPayment) {
  return payment ? { payment: payment.receipt() } : {};
}
