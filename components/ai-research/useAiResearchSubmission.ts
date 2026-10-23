"use client";
import { usePaymentQuoteExpiry } from "@/components/action-payment/usePaymentQuoteExpiry";
import type { analyzeAiResearchAction } from "@/lib/actions/ai-research";
import type { AiResearchCatalog } from "@/lib/ai-research/catalog-types";
import type { promptSchema, visibilitySchema } from "@/lib/ai-research/schema";
import type { AiResearchOutcome } from "@/lib/ai-research/service";
import { useRef, useState, useTransition } from "react";
import type { z } from "zod";
import type { AiResearchForm } from "./AiVisibilityFields";
import { researchInputFingerprint } from "./ai-research-presets";

export function useAiResearchSubmission({
  form,
  mode,
  catalog,
  projectId,
  canRun,
  unavailable,
  analyzeAction,
  initialOutcome,
}: Readonly<{
  form: AiResearchForm;
  mode: "prompt" | "visibility";
  catalog?: AiResearchCatalog;
  projectId: string;
  canRun: boolean;
  unavailable: boolean;
  analyzeAction: typeof analyzeAiResearchAction;
  initialOutcome?: AiResearchOutcome;
}>) {
  const [outcome, setOutcome] = useState(initialOutcome);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const [estimatedInput, setEstimatedInput] = useState<string | null>(null);
  const [execution, setExecution] = useState<"idle" | "review" | "complete">(
    initialOutcome && "retryBlocked" in initialOutcome && initialOutcome.retryBlocked
      ? "review"
      : initialOutcome &&
          "safeToStartNewRequest" in initialOutcome &&
          initialOutcome.safeToStartNewRequest
        ? "complete"
        : "idle",
  );
  const requestId = useRef<string | null>(null);
  const frozenInput = useRef<z.output<typeof promptSchema | typeof visibilitySchema> | null>(null);
  const values = form.watch();
  const actual = "cost_policy" in values && values.cost_policy === "provider_actual_cost";
  const fingerprint = researchInputFingerprint(mode, values, catalog);
  const current = estimatedInput === fingerprint && outcome?.ok && outcome.estimate;
  const quote = current ? outcome.payment : undefined;
  const expired = usePaymentQuoteExpiry(quote ? Date.parse(quote.expiresAt) : Infinity);
  const estimateCurrent = Boolean(current);
  const limit =
    actual && "estimated_cost_limit_cents" in values
      ? values.estimated_cost_limit_cents
      : values.max_cost_cents;
  const credentialsValid =
    !actual ||
    (outcome?.ok &&
      outcome.estimate &&
      outcome.credentialSource === "own" &&
      typeof outcome.estimateCredentialsRef === "string" &&
      /^[a-f0-9]{64}$/.test(outcome.estimateCredentialsRef) &&
      outcome.estimateKind === "forecast" &&
      outcome.forecastScope === "tokens_and_base_only" &&
      outcome.isPartialEstimate === true &&
      outcome.isGuaranteedMaximum === false);
  const estimateForLimit =
    outcome?.ok && outcome.estimate
      ? outcome.pricingPolicy === "measured_engines"
        ? quote?.charge.unit.kind === "credits" && quote.charge.value !== null
          ? Number(quote.charge.value)
          : Number.NaN
        : outcome.estimatedCostCents
      : Number.NaN;
  const estimateAffordable = Boolean(
    current &&
      quote?.availability.allowed &&
      !expired &&
      credentialsValid &&
      outcome?.ok &&
      outcome.estimate &&
      Number.isFinite(estimateForLimit) &&
      estimateForLimit >= 0 &&
      estimateForLimit <= (limit ?? 0),
  );
  const retryBlocked = execution === "review";
  const completed = execution === "complete";
  const sourceRetryAvailable = Boolean(
    outcome && !outcome.ok && outcome.reason === "no_source" && !retryBlocked && !pending,
  );
  function newRequest() {
    if (!completed && !sourceRetryAvailable) return;
    requestId.current = null;
    form.unregister(["idempotency_key", "estimate_credentials_ref"]);
    setExecution("idle");
    setEstimatedInput(null);
    setOutcome(undefined);
    setError(false);
  }
  function submit(estimateOnly: boolean, paymentOptionId?: string) {
    if (
      !canRun ||
      unavailable ||
      pending ||
      execution !== "idle" ||
      (!estimateOnly && !estimateAffordable)
    )
      return;
    if (paymentOptionId) form.setValue("payment_option_id", paymentOptionId);
    form.setValue("estimate_only", estimateOnly);
    if (actual && !estimateOnly && outcome?.ok && outcome.estimate) {
      requestId.current ??= crypto.randomUUID();
      form.setValue("idempotency_key", requestId.current);
      form.setValue("estimate_credentials_ref", outcome.estimateCredentialsRef);
    }
    void form.handleSubmit((input) =>
      startTransition(async () => {
        setError(false);
        const submittedInput = researchInputFingerprint(mode, form.getValues(), catalog);
        if (actual && !estimateOnly) setExecution("review");
        try {
          if (estimateOnly) frozenInput.current = structuredClone(input);
          let request: unknown = { ...input, require_payment: true };
          if (!estimateOnly) {
            if (!quote || !frozenInput.current || expired) return;
            request = {
              ...frozenInput.current,
              estimate_only: false,
              require_payment: true,
              payment_option_id: quote.option.id,
              accepted_payment: { quote_token: quote.quoteToken },
              ...(actual
                ? {
                    idempotency_key: requestId.current ?? undefined,
                    estimate_credentials_ref:
                      outcome?.ok && outcome.estimate ? outcome.estimateCredentialsRef : undefined,
                  }
                : {}),
            };
          }
          const result = await analyzeAction(projectId, mode, request);
          setOutcome(result);
          if (
            ("retryBlocked" in result && result.retryBlocked) ||
            (!estimateOnly &&
              result.payment &&
              "state" in result.payment &&
              (result.payment.state === "pending" || result.payment.state === "unknown"))
          )
            setExecution("review");
          setEstimatedInput(result.ok && result.estimate ? submittedInput : null);
          if (actual && !estimateOnly) {
            if (!result.ok && result.safeToStartNewRequest && !result.retryBlocked)
              setExecution("complete");
            else if (
              result.ok &&
              !result.estimate &&
              result.result.costStatus === "confirmed" &&
              !result.retryBlocked
            )
              setExecution("complete");
          }
        } catch {
          setEstimatedInput(null);
          setError(true);
          if (!estimateOnly) setExecution("review");
        }
      }),
    )();
  }
  return {
    outcome,
    quote,
    expired,
    error,
    pending,
    estimateCurrent,
    estimateAffordable,
    credentialsRejected: Boolean(current && actual && !credentialsValid),
    retryBlocked,
    completed,
    submit,
    newRequest,
    sourceRetryAvailable,
  };
}
