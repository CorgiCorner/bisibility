import "server-only";
import { createHash } from "node:crypto";
import { createAgentReport } from "@/lib/agent-reports/service";
import { isBudgetExhaustedError } from "@/lib/metering/admission-errors";
import {
  budgetDenialReason,
  MISSING_PROJECT_BUDGET_MESSAGE,
  UNRESOLVED_USAGE_MESSAGE,
} from "@/lib/metering/budget-denial";
import { withProviderLookupCache } from "@/lib/provider-lookups/cache";
import { ProviderLookupSignal } from "@/lib/provider-lookups/paid-call";
import type { ProviderRequestOrigin } from "@/lib/provider-usage/surface";
import type { ProviderRequestTrigger } from "@/lib/provider-usage/tag";
import { DeploymentAdmissionExhaustedError } from "@/lib/providers/execution-extension-errors";
import {
  ACTUAL_COST_ASSUMPTIONS,
  ACTUAL_COST_EXCLUSIONS,
  credentialReference,
} from "./actual-cost";
import { runActualCost } from "./actual-cost-run";
import { admissionRate, loadAiAdmission } from "./admission";
import { requireAiSource } from "./context";
import { AI_REQUEST_BUDGET_MS } from "./deadline";
import { executeResearch } from "./execution";
import { isLegacyPrompt, isLegacyVisibility } from "./legacy";
import { researchProvenance } from "./report-provenance";
import {
  type AiResearchKind,
  type PromptInput,
  promptSchema,
  type VisibilityInput,
  visibilitySchema,
} from "./schema";
import type { AiResearchResult } from "./types";
import { AiPreDispatchRefusal, AiResearchValidationError } from "./validation";

export type AiResearchContext = {
  projectId: string;
  actorId?: string | null;
  origin: ProviderRequestOrigin;
  execution?: { trigger: ProviderRequestTrigger; correlationId: string };
};
export type AiResearchOutcome =
  | {
      ok: true;
      estimate: true;
      estimatedCostCents: number;
      evidence: AiResearchResult["evidence"];
      estimateKind?: "forecast" | "admission_bound";
      isGuaranteedMaximum?: boolean;
      credentialSource?: "own" | "hosted";
      estimateCredentialsRef?: string;
      forecastAssumptions?: string[];
      forecastScope?: "tokens_and_base_only";
      pricingPolicy?: string;
      pricingCheckedAt?: string;
      isPartialEstimate?: boolean;
      forecastExclusions?: string[];
    }
  | {
      ok: true;
      estimate: false;
      cached: boolean;
      reportId: string;
      costCents: number;
      result: AiResearchResult;
      retryBlocked?: boolean;
      safeToStartNewRequest?: boolean;
    }
  | {
      ok: false;
      reason: string;
      message: string;
      retryBlocked?: boolean;
      safeToStartNewRequest?: boolean;
    };

async function run(
  context: AiResearchContext,
  kind: AiResearchKind,
  input: VisibilityInput | PromptInput,
): Promise<AiResearchOutcome> {
  const deadlineAt = Date.now() + AI_REQUEST_BUDGET_MS;
  let source: Awaited<ReturnType<typeof requireAiSource>>;
  try {
    source = await requireAiSource(context.projectId);
  } catch (error) {
    if ("prompt" in input && input.cost_policy === "provider_actual_cost" && !input.estimate_only)
      throw new AiPreDispatchRefusal(error);
    throw error;
  }
  const admission = () => loadAiAdmission(source, input, deadlineAt);
  const evidence = kind === "ai_visibility" ? "observed_dataset" : "synthetic_prompt_test";
  if (input.estimate_only) {
    const admitted = await admission();
    const actual = admitted.policy === "provider_actual_cost";
    return {
      ok: true,
      estimate: true,
      estimatedCostCents: admitted.estimate,
      evidence,
      estimateKind: actual ? "forecast" : "admission_bound",
      isPartialEstimate: actual,
      isGuaranteedMaximum: admitted.policy === "current_catalog",
      pricingPolicy: admitted.policy,
      pricingCheckedAt: admissionRate(admitted, kind, admitted.estimate).checkedAt,
      credentialSource: source.connection.credentialSource === "own" ? "own" : "hosted",
      estimateCredentialsRef: credentialReference(source.connection),
      ...(actual
        ? {
            forecastAssumptions: ACTUAL_COST_ASSUMPTIONS,
            forecastExclusions: ACTUAL_COST_EXCLUSIONS,
            forecastScope: "tokens_and_base_only" as const,
          }
        : {}),
    };
  }
  if ("prompt" in input && input.cost_policy === "provider_actual_cost") {
    return runActualCost({ context, input, source, loadAdmission: admission, deadlineAt });
  }
  const legacy = "prompt" in input ? isLegacyPrompt(input) : isLegacyVisibility(input);
  const { fresh, estimate_only: _estimateOnly, max_cost_cents: _cap, ...rawIdentity } = input;
  if (legacy && "prompt" in rawIdentity) {
    delete (rawIdentity as Partial<PromptInput>).cost_policy;
    delete (rawIdentity as Partial<PromptInput>).max_output_tokens;
    delete (rawIdentity as Partial<PromptInput>).web_search;
    delete (rawIdentity as Partial<PromptInput>).response_language;
    delete (rawIdentity as Partial<PromptInput>).country_iso_code;
  }
  const identity = Object.fromEntries(
    Object.entries(rawIdentity).filter(([, value]) => value !== undefined),
  );
  const key = `ai:${legacy ? "v1" : "v2"}:${context.projectId}:${source.connection.id}:${kind}:${createHash("sha256").update(JSON.stringify(identity)).digest("hex")}`;
  const loaded = await withProviderLookupCache({
    fresh,
    key,
    ttlSeconds: 43_200,
    lockTtlSeconds: 330,
    load: async () => {
      const admitted = await admission();
      const { estimate } = admitted;
      if (input.max_cost_cents !== undefined && estimate > input.max_cost_cents)
        throw new ProviderLookupSignal({
          ok: false,
          reason: "cost_limit_exceeded",
          estimatedCostCents: estimate,
        });
      const { result, providerRequestIds } = await executeResearch({
        context,
        kind,
        input,
        source,
        admitted,
        deadlineAt,
      });
      const report = await createAgentReport({
        projectId: context.projectId,
        actorId: context.actorId,
        kind,
        title: `${kind === "ai_visibility" ? "AI visibility" : "Prompt comparison"}: ${input.brand}`,
        body: { input: identity, result },
        provenance: researchProvenance({
          kind,
          input,
          admission: admitted,
          estimate,
          deadlineAt,
          providerRequestIds,
          providerId: source.provider.id,
          rows: result.rows,
        }),
      });
      return { reportId: report.id, result };
    },
  });
  if (loaded.status === "contended")
    return {
      ok: false,
      reason: "in_progress",
      message: "An identical analysis is already running.",
    };
  return {
    ok: true,
    estimate: false,
    cached: loaded.cached,
    ...loaded.value,
    costCents: loaded.cached ? 0 : loaded.value.result.costCents,
  };
}
async function outcome(load: () => Promise<AiResearchOutcome>): Promise<AiResearchOutcome> {
  try {
    return await load();
  } catch (caught) {
    const safe = caught instanceof AiPreDispatchRefusal;
    const error = safe ? caught.original : caught;
    const refusal = safe ? { safeToStartNewRequest: true, retryBlocked: false } : {};
    if (error instanceof AiResearchValidationError)
      return {
        ok: false,
        reason: error.reason,
        message: error.message,
        ...refusal,
        ...(["usage_reconciliation_required", "idempotency_conflict"].includes(error.reason)
          ? { retryBlocked: true }
          : {}),
      };
    if (error instanceof ProviderLookupSignal)
      return {
        ok: false,
        ...refusal,
        reason: budgetDenialReason(error.outcome) ?? error.outcome.reason,
        ...(budgetDenialReason(error.outcome) === "usage_reconciliation_required"
          ? { retryBlocked: true }
          : {}),
        message:
          budgetDenialReason(error.outcome) === "budget_missing"
            ? MISSING_PROJECT_BUDGET_MESSAGE
            : budgetDenialReason(error.outcome) === "usage_reconciliation_required"
              ? UNRESOLVED_USAGE_MESSAGE
              : error.outcome.reason === "no_source"
                ? "Connect a compatible data provider in Integrations."
                : `Analysis unavailable: ${error.outcome.reason}.`,
      };
    if (
      safe &&
      budgetDenialReason(error) &&
      (isBudgetExhaustedError(error) ||
        (error instanceof DeploymentAdmissionExhaustedError && error.reason === "budget"))
    )
      return {
        ok: false,
        reason: budgetDenialReason(error) ?? "budget_missing",
        message:
          budgetDenialReason(error) === "usage_reconciliation_required"
            ? UNRESOLVED_USAGE_MESSAGE
            : MISSING_PROJECT_BUDGET_MESSAGE,
        ...refusal,
        ...(budgetDenialReason(error) === "usage_reconciliation_required"
          ? { retryBlocked: true }
          : {}),
      };
    if (safe)
      return {
        ok: false,
        reason: "analysis_refused",
        message:
          "Analysis was refused before any paid provider request. Review provider availability and limits before creating a new request.",
        ...refusal,
      };
    throw error;
  }
}
export function analyzeAiVisibility(context: AiResearchContext, input: unknown) {
  return outcome(() => run(context, "ai_visibility", visibilitySchema.parse(input)));
}
export function compareAiPrompts(context: AiResearchContext, input: unknown) {
  return outcome(() => run(context, "prompt_explorer", promptSchema.parse(input)));
}
