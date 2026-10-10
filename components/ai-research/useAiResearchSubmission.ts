"use client";
import type { analyzeAiResearchAction } from "@/lib/actions/ai-research";
import type { AiResearchCatalog } from "@/lib/ai-research/catalog-types";
import type { AiResearchOutcome } from "@/lib/ai-research/service";
import { useRef, useState, useTransition } from "react";
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
  const values = form.watch();
  const actual = "cost_policy" in values && values.cost_policy === "provider_actual_cost";
  const fingerprint = researchInputFingerprint(mode, values, catalog);
  const current = estimatedInput === fingerprint && outcome?.ok && outcome.estimate;
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
  const estimateAffordable = Boolean(
    current &&
      credentialsValid &&
      outcome?.ok &&
      outcome.estimate &&
      outcome.estimatedCostCents <= (limit ?? 0),
  );
  const retryBlocked = execution === "review";
  const completed = execution === "complete";
  function newRequest() {
    if (!completed) return;
    requestId.current = null;
    form.unregister(["idempotency_key", "estimate_credentials_ref"]);
    setExecution("idle");
    setEstimatedInput(null);
    setOutcome(undefined);
    setError(false);
  }
  function submit(estimateOnly: boolean) {
    if (
      !canRun ||
      unavailable ||
      pending ||
      execution !== "idle" ||
      (!estimateOnly && !estimateAffordable)
    )
      return;
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
          const result = await analyzeAction(projectId, mode, input);
          setOutcome(result);
          if ("retryBlocked" in result && result.retryBlocked) setExecution("review");
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
        }
      }),
    )();
  }
  return {
    outcome,
    error,
    pending,
    estimateCurrent,
    estimateAffordable,
    credentialsRejected: Boolean(current && actual && !credentialsValid),
    retryBlocked,
    completed,
    submit,
    newRequest,
  };
}
