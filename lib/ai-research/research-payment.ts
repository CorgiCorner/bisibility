import "server-only";
import type { PaidCallPayment, PaymentPart } from "@/lib/action-payment/paid-call";
import { actionPaymentReceipt, readPaymentPart } from "@/lib/action-payment/receipt";
import { prepareActionPayment } from "@/lib/action-payment/session";
import { ActionPaymentError } from "@/lib/action-payment/token";
import type { AiAdmission } from "./admission";
import { admissionRate, admittedModelCost } from "./admission";
import type { requireAiSource } from "./context";
import {
  aiOwnPaymentQuote,
  aiPaymentGuard,
  bindAiPaymentExecution,
  readAiPaymentConsent,
} from "./payment";
import type { AiResearchKind, PromptInput, VisibilityInput } from "./schema";
import type { AiResearchContext } from "./service";

export function researchPaymentIdentity(input: PromptInput | VisibilityInput) {
  const {
    accepted_payment: _accepted,
    payment_option_id: _option,
    require_payment: _required,
    estimate_only: _estimate,
    ...identity
  } = input;
  if ("estimate_credentials_ref" in identity) delete identity.estimate_credentials_ref;
  if ("idempotency_key" in identity) delete identity.idempotency_key;
  return identity;
}
export async function prepareResearchAiPayment(
  context: AiResearchContext,
  kind: AiResearchKind,
  input: PromptInput | VisibilityInput,
  source: Awaited<ReturnType<typeof requireAiSource>>,
  admission: AiAdmission,
  cached = false,
) {
  if (!source.project.ownerId || !source.connection.publicId) {
    if (input.require_payment || input.accepted_payment)
      throw new ActionPaymentError("payment_unavailable");
    return null;
  }
  const children =
    "prompt" in input
      ? input.models.map((model) => ({
          key: model,
          quantity: 1,
          costCents: admittedModelCost(admission, model, input),
          cached,
        }))
      : [{ key: "visibility", quantity: 1, costCents: admission.estimate, cached }];
  const definition = [
    researchPaymentIdentity(input),
    admission.policy,
    admissionRate(admission, kind, admission.estimate).checkedAt,
    admission.estimate,
    admission.policy === "legacy_dated" ? null : admission.capabilities,
  ];
  if (admission.policy !== "provider_actual_cost") {
    const session = await prepareActionPayment({
      projectId: source.project.id,
      ownerId: source.project.ownerId,
      actorId: context.actorId,
      source: context.origin.source,
      feature: kind,
      lookupCacheTtlSeconds: source.project.lookupCacheTtlSeconds,
      connection: source.connection,
      provider: source.provider,
      acceptedPayment: input.accepted_payment
        ? { quoteToken: input.accepted_payment.quote_token }
        : undefined,
      paymentOptionId: input.payment_option_id,
      requirePayment: input.require_payment,
      request: definition,
      children,
      maxCostCents: input.max_cost_cents,
    });
    return session
      ? {
          quote: session.quote,
          options: session.options,
          receipt: session.receipt,
          child: session.child,
          get hasAttempted() {
            return session.hasAttempted;
          },
          consent: undefined,
          bindExecution: (_id: string) => undefined,
        }
      : null;
  }
  const quoted = aiOwnPaymentQuote({
    source,
    actorId: context.actorId,
    entrySource: context.origin.source,
    feature: kind,
    definition,
    estimatedCostCents: admission.estimate,
  });
  if (input.payment_option_id && input.payment_option_id !== quoted.payment.option.id)
    throw new ActionPaymentError("payment_quote_changed");
  let consent = input.estimate_only
    ? undefined
    : quoted.accept(
        input.accepted_payment ? { quoteToken: input.accepted_payment.quote_token } : undefined,
        input.require_payment,
      );
  const parts: PaymentPart[] = [];
  return {
    quote: quoted.payment,
    options: quoted.paymentOptions,
    get consent() {
      return consent;
    },
    bindExecution(id: string) {
      consent = bindAiPaymentExecution(consent, id);
      return consent;
    },
    get hasAttempted() {
      return parts.some((part) => part.attempted);
    },
    receipt: () =>
      actionPaymentReceipt(
        consent ? readAiPaymentConsent(consent).id : quoted.payment.id,
        quoted.payment.option,
        parts,
        parts.some((part) => part.attempted),
      ),
    child(_key: string): PaidCallPayment | undefined {
      if (!consent) return undefined;
      const original = readAiPaymentConsent(consent);
      const guard = aiPaymentGuard(consent);
      if (!guard) throw new Error("Accepted payment guard unavailable");
      return {
        operationKey: `ai-payment:${original.id}:${children.findIndex((child) => child.key === _key)}`,
        snapshot: {
          credentialSource: "own",
          credentialsEncrypted: source.connection.credentialsEncrypted,
        },
        guard,
        async record(ref) {
          try {
            parts.push(
              await readPaymentPart(
                quoted.payment.option,
                { unit: quoted.payment.option.payableUnit, basis: "provider_cost" },
                ref,
              ),
            );
          } catch {
            parts.push({
              attempted: true,
              charge: {
                value: null,
                unit: quoted.payment.option.payableUnit,
                certainty: "unknown",
              },
            });
          }
        },
      };
    },
  };
}
export type ResearchAiPayment = Awaited<ReturnType<typeof prepareResearchAiPayment>>;
