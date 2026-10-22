import { actionPaymentReceiptSchema } from "@/lib/action-payment/schema";
import { researchCacheIdentity } from "./cache-identity";
import { AiResearchPaidFailure, outcome } from "./outcome";
import { prepareResearchAiPayment } from "./research-payment";
import "server-only";
import { createAgentReport } from "@/lib/agent-reports/service";
import {
  providerLookupCacheConfigured,
  readProviderLookupCache,
  withProviderLookupCache,
} from "@/lib/provider-lookups/cache";
import { ProviderLookupSignal } from "@/lib/provider-lookups/paid-call";
import {
  projectCacheTtl,
  withProjectCachePolicy,
} from "@/lib/provider-lookups/project-cache-policy";
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
import { researchProvenance } from "./report-provenance";
import {
  type AiResearchKind,
  type PromptInput,
  promptSchema,
  type VisibilityInput,
  visibilitySchema,
} from "./schema";
import { AiPreDispatchRefusal } from "./validation";

export type { AiResearchContext, AiResearchOutcome } from "./outcome-types";

import type { AiResearchContext, AiResearchOutcome } from "./outcome-types";

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
  return withProjectCachePolicy(
    source.project.lookupCacheTtlSeconds,
    async (): Promise<AiResearchOutcome> => {
      const admission = () =>
        loadAiAdmission(
          source,
          input,
          deadlineAt,
          !input.estimate_only && input.max_cost_cents === 0,
        );
      const { key, identity, fresh } = researchCacheIdentity(
        context.projectId,
        source.connection.id,
        kind,
        input,
      );
      const evidence = kind === "ai_visibility" ? "observed_dataset" : "synthetic_prompt_test";
      if (input.estimate_only) {
        const admitted = await admission();
        const actual = admitted.policy === "provider_actual_cost";
        return {
          ...(await (async () => {
            const cached =
              admitted.policy !== "provider_actual_cost" &&
              !fresh &&
              providerLookupCacheConfigured() &&
              Boolean(await readProviderLookupCache(key));
            const payment = await prepareResearchAiPayment(
              context,
              kind,
              input,
              source,
              admitted,
              Boolean(cached),
            );
            return payment ? { payment: payment.quote, paymentOptions: payment.options } : {};
          })()),
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
      const loaded = await withProviderLookupCache({
        fresh,
        key,
        ttlSeconds: projectCacheTtl(43_200),
        lockTtlSeconds: 330,
        load: async () => {
          const admitted = await admission();
          const { estimate } = admitted;
          if (input.max_cost_cents === 0)
            throw new ProviderLookupSignal({
              ok: false,
              reason: "cost_limit_exceeded",
              estimatedCostCents: estimate,
            });
          const payment = await prepareResearchAiPayment(context, kind, input, source, admitted);
          if (input.max_cost_cents !== undefined && estimate > input.max_cost_cents)
            throw new ProviderLookupSignal({
              ok: false,
              reason: "cost_limit_exceeded",
              estimatedCostCents: estimate,
            });
          try {
            const { result, providerRequestIds } = await executeResearch({
              context,
              kind,
              input,
              source,
              admitted,
              payment,
              deadlineAt,
            });
            const report = await createAgentReport({
              projectId: context.projectId,
              actorId: context.actorId,
              kind,
              title: `${kind === "ai_visibility" ? "AI visibility" : "Prompt comparison"}: ${input.brand}`,
              body: {
                input: identity,
                result,
                ...(payment?.hasAttempted ? { originalPayment: payment.receipt() } : {}),
              },
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
            return {
              reportId: report.id,
              result,
              ...(payment ? { originalPayment: payment.receipt() } : {}),
            };
          } catch (error) {
            if (payment?.hasAttempted) throw new AiResearchPaidFailure(error, payment.receipt());
            throw error;
          }
        },
      });
      if (loaded.status === "contended")
        return {
          ok: false,
          reason: "in_progress",
          message: "An identical analysis is already running.",
        };
      const { originalPayment: rawPayment, ...value } = loaded.value;
      const validated = actionPaymentReceiptSchema.safeParse(rawPayment);
      const originalPayment = validated.success ? validated.data : undefined;
      return {
        ok: true,
        estimate: false,
        cached: loaded.cached,
        ...value,
        ...(originalPayment ? { originalPayment } : {}),
        costCents: loaded.cached ? 0 : loaded.value.result.costCents,
        ...(originalPayment
          ? {
              payment: loaded.cached
                ? {
                    ...originalPayment,
                    state: "free" as const,
                    charge: {
                      ...originalPayment.charge,
                      value: "0",
                      certainty: "free" as const,
                    },
                  }
                : originalPayment,
            }
          : {}),
      };
    },
  );
}

export function analyzeAiVisibility(context: AiResearchContext, input: unknown) {
  return outcome(() => run(context, "ai_visibility", visibilitySchema.parse(input)));
}
export function compareAiPrompts(context: AiResearchContext, input: unknown) {
  return outcome(() => run(context, "prompt_explorer", promptSchema.parse(input)));
}
