import "server-only";
import { enumerateActionPaymentOptions } from "@/lib/action-payment/options";
import {
  type ActionPaymentInput,
  type PaymentChild,
  prepareActionPayment,
} from "@/lib/action-payment/session";
import type { DomainOverviewProject, DomainOverviewSource } from "./context";
import { domainOverviewSources } from "./context";
import type { DomainOverviewServiceContext } from "./types";

export type DomainPayment = Awaited<ReturnType<typeof prepareActionPayment>>;
export function prepareDomainPayment(
  context: DomainOverviewServiceContext,
  options: ActionPaymentInput,
  project: DomainOverviewProject,
  source: DomainOverviewSource,
  request: unknown,
  children: PaymentChild[],
) {
  return prepareActionPayment({
    ...options,
    actorId: context.actorId,
    projectId: project.id,
    ownerId: project.ownerId,
    source: context.origin.source,
    feature: "domain_overview",
    lookupCacheTtlSeconds: project.lookupCacheTtlSeconds ?? null,
    connection: source.connection,
    provider: source.provider,
    request,
    children,
  });
}
export function domainPaymentEstimate(payment: DomainPayment, project: DomainOverviewProject) {
  return payment
    ? {
        payment: payment.quote,
        paymentOptions: enumerateActionPaymentOptions(
          domainOverviewSources(project),
          "domain_overview",
        ),
      }
    : {};
}
export function domainPaymentReceipt(payment: DomainPayment) {
  return payment ? { payment: payment.receipt() } : {};
}
