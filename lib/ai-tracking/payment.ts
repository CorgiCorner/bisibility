import "server-only";
import {
  aiOwnPaymentQuote,
  assertAiPaymentDefinition,
  readAiPaymentConsent,
} from "@/lib/ai-research/payment";
import { getSerpProvider } from "@/lib/providers/registry";
import type { trackingAdmissionContext } from "./admission/context";
import type { PlanTrackingRunInput } from "./contract";
import { sourceConfigurationHash } from "./identity";
export function trackingPaymentDefinition(
  input: Pick<
    PlanTrackingRunInput,
    | "promptIds"
    | "configurations"
    | "consentRevision"
    | "credentialVersion"
    | "budgetRevision"
    | "paymentRecurrence"
    | "paymentScheduleId"
  >,
) {
  return [
    [...input.promptIds].sort(),
    [
      ...new Map(
        input.configurations.map((configuration) => [
          sourceConfigurationHash(configuration),
          configuration,
        ]),
      ).entries(),
    ]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, configuration]) => configuration),
    input.consentRevision,
    input.credentialVersion,
    input.budgetRevision,
    input.paymentRecurrence ?? null,
    input.paymentScheduleId ?? null,
  ];
}
export type TrackingPaymentInput = Parameters<typeof trackingPaymentDefinition>[0] &
  Pick<PlanTrackingRunInput, "actorId" | "entrySource" | "paymentScope">;
export function trackingPaymentQuote(
  context: Awaited<ReturnType<typeof trackingAdmissionContext>>,
  input: TrackingPaymentInput,
  estimatedCostCents: number,
) {
  return aiOwnPaymentQuote({
    source: { ...context, provider: getSerpProvider(context.connection.provider) },
    actorId: input.actorId,
    entrySource: input.entrySource,
    feature: "ai_tracking",
    scope: input.paymentScope ?? "manual",
    definition: trackingPaymentDefinition(input),
    estimatedCostCents,
  });
}
export function assertTrackingPayment(
  projectId: string,
  input: PlanTrackingRunInput,
  executionId?: string,
) {
  if (
    input.paymentConsent &&
    input.origin === "scheduled" &&
    readAiPaymentConsent(input.paymentConsent).recurringScheduleId !== input.scheduleId
  )
    throw new Error("Tracking payment consent belongs to another schedule.");
  assertAiPaymentDefinition(input.paymentConsent, {
    projectId,
    actorId: input.actorId,
    feature: "ai_tracking",
    definition: trackingPaymentDefinition(input),
    scope: input.paymentScope ?? "manual",
    executionId,
  });
}
