import {
  assertTrackingPayment,
  trackingPaymentDefinition,
  trackingPaymentQuote,
} from "@/lib/ai-tracking/payment";
import "server-only";
import type { PlanTrackingRunInput, SamplePlan } from "@/lib/ai-tracking/contract";
import { payloadHash } from "@/lib/ai-tracking/identity";
import {
  TRACKING_CAPABILITY_VERSION,
  validateTrackingRequest,
} from "@/lib/ai-tracking/providers/capabilities";
import { planTrackingRun } from "@/lib/ai-tracking/stores/runs";
import { prisma } from "@/lib/db/prisma";
import { preflightProviderBudget } from "@/lib/provider-lookups/paid-call-budget";
import { surfaceOf } from "@/lib/provider-usage/surface";
import { reauthorizeTrackingActor } from "./actor";
import { trackingAdmissionContext } from "./context";
import { TRACKING_PRICE_CHECKED_AT, trackingModelForecast } from "./pricing";

export type TrackingPreviewInput = Pick<PlanTrackingRunInput, "promptIds" | "configurations"> & {
  credentialConnectionId?: string;
  actorId?: string;
  entrySource?: PlanTrackingRunInput["entrySource"];
  paymentScope?: "manual" | "recurring";
  paymentScheduleId?: string;
  paymentRecurrence?: { cron: string; timezone: string };
};
export function trackingConsentRevision(
  configurations: PlanTrackingRunInput["configurations"],
  credentialVersion: string,
  revisions: { id: string; textHash: string }[],
) {
  return payloadHash([
    "tracking-paid-consent-v1",
    TRACKING_CAPABILITY_VERSION,
    TRACKING_PRICE_CHECKED_AT,
    [...configurations].sort((a, b) => payloadHash(a).localeCompare(payloadHash(b))),
    credentialVersion,
    [...revisions].sort((a, b) => a.id.localeCompare(b.id)),
  ]);
}
export async function previewTrackingRun(projectId: string, input: TrackingPreviewInput) {
  const context = await trackingAdmissionContext(projectId, input.credentialConnectionId);
  const prompts = await prisma.aiPrompt.findMany({
    where: {
      projectId,
      id: { in: input.promptIds },
      archivedAt: null,
      pausedAt: null,
      OR: [{ topicId: null }, { topic: { archivedAt: null, pausedAt: null } }],
    },
    include: { revisions: { orderBy: { ordinal: "desc" }, take: 1 } },
  });
  if (!prompts.length || prompts.length !== new Set(input.promptIds).size)
    throw new Error("Tracking requires active project prompts.");
  let estimatedCostCents = 0;
  for (const configuration of input.configurations) {
    for (const prompt of prompts)
      validateTrackingRequest({
        ...configuration,
        promptText: prompt.revisions[0]?.text ?? "",
        requestedModel: configuration.model,
        requestedParameters: configuration.parameters,
      });
    for (const prompt of prompts)
      estimatedCostCents += await trackingModelForecast(
        configuration,
        prompt.revisions[0]?.text ?? "",
        Date.now() + 10_000,
      );
  }
  if (!input.configurations.length) throw new Error("Tracking requires a source configuration.");
  const preview = {
    configurations: input.configurations,
    credentialConnectionId: context.connection.id,
    credentialConnectionPublicId: context.connection.publicId,
    credentialVersion: context.credentialVersion,
    budgetRevision: context.budgetRevision,
    consentRevision: trackingConsentRevision(
      input.configurations,
      context.credentialVersion,
      prompts.map((prompt) => ({
        id: prompt.revisions[0].id,
        textHash: prompt.revisions[0].textHash,
      })),
    ),
    estimatedCostCents,
  };
  const payment = input.actorId
    ? trackingPaymentQuote(
        context,
        {
          ...input,
          ...preview,
          actorId: input.actorId,
          entrySource: input.entrySource ?? "app",
        },
        estimatedCostCents,
      )
    : null;
  return {
    ...preview,
    ...(payment ? { payment: payment.payment, paymentOptions: payment.paymentOptions } : {}),
  };
}
export async function approveTrackingConfiguration(
  projectId: string,
  input: PlanTrackingRunInput & { consent: boolean },
) {
  await reauthorizeTrackingActor(projectId, input);
  if (input.consent !== true) throw new Error("Explicit paid tracking consent is required.");
  const preview = await previewTrackingRun(projectId, input);
  for (const key of ["credentialVersion", "budgetRevision", "consentRevision"] as const)
    if (input[key] !== preview[key])
      throw new Error("Tracking preview changed. Review it again before launch.");
  await preflightProviderBudget({
    projectId,
    connectionId: preview.credentialConnectionId,
    provider: "dataforseo",
    estimatedCostCents: preview.estimatedCostCents,
    surface: surfaceOf(input.entrySource),
  });
  if (input.paymentConsent && input.origin === "scheduled") {
    assertTrackingPayment(projectId, input);
    return { ...preview, paymentConsent: input.paymentConsent };
  }
  const payment =
    input.actorId && (input.requirePayment || input.acceptedPayment)
      ? trackingPaymentQuote(
          await trackingAdmissionContext(projectId, preview.credentialConnectionId),
          input,
          preview.estimatedCostCents,
        )
      : null;
  return {
    ...preview,
    paymentConsent: payment?.accept(input.acceptedPayment, input.requirePayment),
  };
}
export async function launchTrackingRun(
  projectId: string,
  input: PlanTrackingRunInput & { consent: boolean },
) {
  await reauthorizeTrackingActor(projectId, input);
  if (input.origin === "manual" && input.paymentScope === "recurring")
    throw new Error("Manual tracking requires a manual payment review.");
  const prior = await prisma.aiTrackingRun.findUnique({
    where: { projectId_idempotencyKey: { projectId, idempotencyKey: input.idempotencyKey } },
    include: { samples: true },
  });
  if (prior) {
    const stored = prior.launchPayload as unknown as PlanTrackingRunInput;
    const identity = (value: PlanTrackingRunInput) =>
      payloadHash([
        trackingPaymentDefinition(value),
        value.paymentScope ?? "manual",
        value.credentialConnectionId,
        value.actorId,
        value.actorCredential ?? null,
        value.origin,
        value.entrySource,
        value.deadline,
        value.scheduleId ?? null,
        value.plannedAt ?? null,
        value.retryOfRunId ?? null,
      ]);
    if (identity(input) !== identity(stored))
      throw new Error("Tracking idempotency key is bound to another request.");
    return prior;
  }
  const approved = await approveTrackingConfiguration(projectId, input);
  const { consent: _consent, acceptedPayment: _accepted, ...plan } = input;
  return planTrackingRun(projectId, { ...plan, paymentConsent: approved.paymentConsent });
}
export async function recheckTrackingAdmission(plan: SamplePlan) {
  await reauthorizeTrackingActor(plan.projectId, plan);
  const revision = await prisma.aiPromptRevision.findFirst({
    where: {
      projectId: plan.projectId,
      id: plan.promptRevisionId,
      prompt: {
        archivedAt: null,
        pausedAt: null,
        OR: [{ topicId: null }, { topic: { archivedAt: null, pausedAt: null } }],
      },
    },
    select: { textHash: true },
  });
  if (!revision || revision.textHash !== plan.promptHash)
    throw new Error("Original tracking prompt is paused, archived, or unavailable.");
  const context = await trackingAdmissionContext(plan.projectId, plan.credentialConnectionId);
  if (
    context.credentialVersion !== plan.credentialVersion ||
    context.budgetRevision !== plan.budgetRevision
  )
    throw new Error("Tracking credential or budget changed after planning.");
  const configuration = {
    provider: plan.provider,
    endpoint: plan.endpoint,
    engine: plan.engine,
    source: plan.source,
    model: plan.requestedModel,
    parameters: plan.requestedParameters,
  };
  {
    const run = await prisma.aiTrackingRun.findFirst({
      where: { id: plan.runId, projectId: plan.projectId },
      include: { samples: { select: { plan: true } } },
    });
    const payload = run?.launchPayload as unknown as PlanTrackingRunInput | undefined;
    if (payload) assertTrackingPayment(plan.projectId, payload, plan.runId);
    if (payloadHash(payload?.paymentConsent ?? null) !== payloadHash(plan.paymentConsent ?? null))
      throw new Error("Tracking payment authority changed after planning.");
    if (plan.origin === "scheduled") {
      const schedule = run?.scheduleId
        ? await prisma.aiTrackingSchedule.findFirst({
            where: {
              projectId: plan.projectId,
              id: run.scheduleId,
              enabled: true,
              archivedAt: null,
            },
            select: { configuration: true },
          })
        : null;
      const current = schedule?.configuration as unknown as PlanTrackingRunInput | undefined;
      if (
        !current ||
        current.consentRevision !== plan.consentRevision ||
        current.credentialVersion !== plan.credentialVersion
      )
        throw new Error("Tracking schedule is paused or its consent changed.");
    }
    const revisions = [
      ...new Map(
        (run?.samples ?? []).map((sample) => {
          const stored = sample.plan as unknown as SamplePlan;
          return [
            stored.promptRevisionId,
            { id: stored.promptRevisionId, textHash: stored.promptHash },
          ] as const;
        }),
      ).values(),
    ];
    if (
      !payload ||
      trackingConsentRevision(payload.configurations, context.credentialVersion, revisions) !==
        plan.consentRevision
    )
      throw new Error("Tracking consent is stale or unavailable.");
  }
  validateTrackingRequest(plan);
  const estimatedCostCents = await trackingModelForecast(
    configuration,
    plan.promptText,
    Math.min(Date.parse(plan.deadline), Date.now() + 10_000),
  );
  await preflightProviderBudget({
    projectId: plan.projectId,
    connectionId: context.connection.id,
    provider: "dataforseo",
    estimatedCostCents,
    surface: surfaceOf(plan.entrySource),
  });
  return { ...context, estimatedCostCents };
}
