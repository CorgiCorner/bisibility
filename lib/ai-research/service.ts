import "server-only";
import { createHash } from "node:crypto";
import { createAgentReport } from "@/lib/agent-reports/service";
import { withProviderLookupCache } from "@/lib/provider-lookups/cache";
import {
  ProviderLookupSignal,
  paidProviderCall,
  preflightProviderBudget,
} from "@/lib/provider-lookups/paid-call";
import type { ProviderRequestOrigin } from "@/lib/provider-usage/surface";
import { surfaceOf } from "@/lib/provider-usage/surface";
import { requireAiSource } from "./context";
import { aiRate, modelAdmissionBound, PROMPT_PRICING, promptCost, visibilityCost } from "./cost";
import { AI_REQUEST_BUDGET_MS, assertAiDeadline } from "./deadline";
import { researchFailure } from "./failure";
import {
  fetchObserved,
  fetchPrompt,
  PROMPT_PATH,
  supportedPromptModels,
  VISIBILITY_PATH,
} from "./provider";
import {
  type AiResearchKind,
  type PromptInput,
  promptSchema,
  type VisibilityInput,
  visibilitySchema,
} from "./schema";
import type { AiResearchResult, AiResearchRow } from "./types";

export type AiResearchContext = {
  projectId: string;
  actorId?: string | null;
  origin: ProviderRequestOrigin;
};
export type AiResearchOutcome =
  | { ok: true; estimate: true; estimatedCostCents: number; evidence: AiResearchResult["evidence"] }
  | {
      ok: true;
      estimate: false;
      cached: boolean;
      reportId: string;
      costCents: number;
      result: AiResearchResult;
    }
  | { ok: false; reason: string; message: string };

async function run(
  context: AiResearchContext,
  kind: AiResearchKind,
  input: VisibilityInput | PromptInput,
): Promise<AiResearchOutcome> {
  const deadlineAt = Date.now() + AI_REQUEST_BUDGET_MS;
  const source = await requireAiSource(context.projectId);
  const estimate = "prompt" in input ? promptCost(input) : visibilityCost(input);
  const evidence = kind === "ai_visibility" ? "observed_dataset" : "synthetic_prompt_test";
  if (input.estimate_only)
    return { ok: true, estimate: true, estimatedCostCents: estimate, evidence };
  const { fresh, estimate_only: _estimateOnly, max_cost_cents: _cap, ...identity } = input;
  const key = `ai:v1:${context.projectId}:${source.connection.id}:${kind}:${createHash("sha256").update(JSON.stringify(identity)).digest("hex")}`;
  const loaded = await withProviderLookupCache({
    fresh,
    key,
    ttlSeconds: 43_200,
    lockTtlSeconds: 180,
    load: async () => {
      if (estimate > input.max_cost_cents)
        throw new ProviderLookupSignal({
          ok: false,
          reason: "cost_limit_exceeded",
          estimatedCostCents: estimate,
        });
      await preflightProviderBudget({
        budgetCapCents: source.project.budgetCapCents,
        connectionId: source.connection.id,
        projectId: context.projectId,
        provider: source.provider.id,
        estimatedCostCents: estimate,
        estimatedUsageQuantity: "prompt" in input ? input.models.length : 1,
        surface: surfaceOf(context.origin.source),
      });
      const common = {
        connection: source.connection,
        credential: context.origin.credential,
        feature: kind,
        itemCount: 1,
        projectId: context.projectId,
        provider: source.provider,
        source: context.origin.source,
        trigger: "manual" as const,
      };
      let costCents = 0;
      let totalAvailable: number | null = null;
      let failure: string | null = null;
      let costStatus: "confirmed" | "unknown" = "confirmed";
      const rows: AiResearchRow[] = [];
      const providerRequestIds: string[] = [];
      let capabilities: ReadonlySet<string> | undefined;
      let dispatched = false;
      const markDispatched = () => {
        dispatched = true;
      };
      try {
        if ("prompt" in input) {
          for (const model of input.models) {
            dispatched = false;
            assertAiDeadline(deadlineAt);
            const answer = await paidProviderCall({
              ...common,
              rate: aiRate(kind, modelAdmissionBound(model)),
              call: async (credentials, usage) => {
                capabilities ??= await supportedPromptModels(credentials, deadlineAt);
                return fetchPrompt(
                  credentials,
                  input,
                  model,
                  usage.tag,
                  deadlineAt,
                  capabilities,
                  markDispatched,
                );
              },
            });
            if (answer.providerRequestId) providerRequestIds.push(answer.providerRequestId);
            costCents += answer.costCents;
            rows.push(answer.row);
            if (costCents > input.max_cost_cents) break;
          }
        } else {
          assertAiDeadline(deadlineAt);
          const observations = await paidProviderCall({
            ...common,
            rate: aiRate(kind, estimate),
            call: (credentials, usage) =>
              fetchObserved(credentials, input, usage.tag, deadlineAt, markDispatched),
          });
          if (observations.providerRequestId)
            providerRequestIds.push(observations.providerRequestId);
          costCents = observations.costCents;
          totalAvailable = observations.totalAvailable;
          rows.push(...observations.rows);
        }
      } catch (error) {
        // No paid dispatch means no uncertain charge. Surface the refusal without caching
        // when there are no earlier answers; a retry after removing the blocker is safe.
        if (!dispatched && rows.length === 0) throw error;
        const classified = researchFailure(error, dispatched);
        costCents += classified.costCents;
        costStatus = classified.costStatus;
        failure = classified.message;
      }
      const result: AiResearchResult = {
        evidence,
        rows,
        totalAvailable,
        failure,
        costStatus,
        truncated:
          totalAvailable !== null
            ? totalAvailable > rows.length
            : "prompt" in input && rows.length < input.models.length,
        fetchedAt: new Date().toISOString(),
        costCents,
      };
      const report = await createAgentReport({
        projectId: context.projectId,
        actorId: context.actorId,
        kind,
        title: `${kind === "ai_visibility" ? "AI visibility" : "Prompt comparison"}: ${input.brand}`,
        body: { input: identity, result },
        provenance: {
          executionBudgetMs: AI_REQUEST_BUDGET_MS,
          deadlineReached: Date.now() >= deadlineAt,
          pricingCheckedAt: "2026-10-02",
          pricingSource: aiRate(kind, estimate).sourceUrl,
          providerRequestIds,
          ...("prompt" in input
            ? {
                modelPricing: input.models.map((model) => ({
                  model,
                  ...PROMPT_PRICING[model],
                  admissionBoundCents: modelAdmissionBound(model),
                  outputTokens: 512,
                  reasoning: false,
                  webSearch: false,
                })),
              }
            : { requestCostCents: 10, rowCostCents: 0.1 }),
          admissionBoundCents: estimate,
          provider: source.provider.id,
          endpoint: kind === "ai_visibility" ? VISIBILITY_PATH : PROMPT_PATH,
          evidence,
          scope: kind === "ai_visibility" ? "provider_dataset_only" : "synthetic_only",
          webSearch: false,
        },
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
  } catch (error) {
    if (error instanceof ProviderLookupSignal)
      return {
        ok: false,
        reason: error.outcome.reason,
        message:
          error.outcome.reason === "no_source"
            ? "Connect a compatible data provider in Integrations."
            : `Analysis unavailable: ${error.outcome.reason}.`,
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
