import { actionPaymentReceiptSchema } from "@/lib/action-payment/schema";
import { researchCacheIdentity } from "./cache-identity";
import { AiResearchPaidFailure, outcome } from "./outcome";
import {
  copyResearchReport,
  researchFundingIdentity,
  researchReportResult,
} from "./prompt-research-reports";
import { promptResearchSchema } from "./prompt-research-schema";
import { prepareResearchAiPayment } from "./research-payment";
import type { ResearchInput } from "./schema";
import "server-only";
import { createAgentReport } from "@/lib/agent-reports/service";
import { indexPromptResearchCache } from "@/lib/project-data-cache/prompt-research-index";
import {
  providerLookupCacheConfigured,
  readProviderLookupCache,
  withProviderLookupCache,
} from "@/lib/provider-lookups/cache";
import { effectiveProjectLookupTtl } from "@/lib/provider-lookups/effective-lookup-ttl";
import { ProviderLookupSignal } from "@/lib/provider-lookups/paid-call";
import { withProjectCachePolicy } from "@/lib/provider-lookups/project-cache-policy";
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
import { type AiResearchKind, promptSchema, visibilitySchema } from "./schema";
import { AiPreDispatchRefusal } from "./validation";

export type { AiResearchContext, AiResearchOutcome } from "./outcome-types";

import type { AiResearchContext, AiResearchOutcome } from "./outcome-types";

async function run(
  context: AiResearchContext,
  kind: AiResearchKind,
  input: ResearchInput,
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
        source.project.ownerId,
        researchFundingIdentity(source.connection),
        effectiveProjectLookupTtl(source.project.lookupCacheTtlSeconds, kind),
      );
      const evidence = kind !== "prompt_explorer" ? "observed_dataset" : "synthetic_prompt_test";
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
          isGuaranteedMaximum:
            admitted.policy === "current_catalog" || admitted.policy === "measured_engines",
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
        ttlSeconds: effectiveProjectLookupTtl(source.project.lookupCacheTtlSeconds, kind),
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
          // Engine mode caps the customer price, so the cap compares with that quoted price.
          const capped =
            admitted.policy === "measured_engines" && payment
              ? Number(payment.quote.charge.value)
              : estimate;
          if (input.max_cost_cents !== undefined && capped > input.max_cost_cents)
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
            const provenance = researchProvenance({
              kind,
              input,
              admission: admitted,
              estimate,
              deadlineAt,
              providerRequestIds,
              providerId: source.provider.id,
              rows: result.rows,
            });
            const report = await createAgentReport({
              projectId: context.projectId,
              actorId: context.actorId,
              kind,
              title:
                "keyword" in input
                  ? `Prompt Research: ${input.keyword}`
                  : `${kind === "ai_visibility" ? "Brand Visibility" : "Prompt comparison"}: ${input.brand}`,
              body: {
                input: identity,
                result: kind === "prompt_research" ? researchReportResult(result) : result,
                ...(payment?.hasAttempted ? { originalPayment: payment.receipt() } : {}),
              },
              provenance,
            });
            return {
              ...("keyword" in input
                ? {
                    researchReport: {
                      projectId: context.projectId,
                      keyword: input.keyword,
                      identity,
                      provenance,
                    },
                  }
                : {}),
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
      const copied =
        kind === "prompt_research" ? await copyResearchReport(context, loaded.value) : null;
      if (kind === "prompt_research" && "keyword" in input)
        await indexPromptResearchCache(
          context.projectId,
          key,
          {
            fetchedAt: loaded.value.result.fetchedAt,
            keyword: input.keyword,
            reportId: copied?.id ?? loaded.value.reportId,
          },
          effectiveProjectLookupTtl(source.project.lookupCacheTtlSeconds, kind),
        );
      const { originalPayment: rawPayment, researchReport: _retained, ...value } = loaded.value;
      const validated = actionPaymentReceiptSchema.safeParse(rawPayment);
      const originalPayment = validated.success && !copied ? validated.data : undefined;
      return {
        ok: true,
        estimate: false,
        cached: loaded.cached,
        ...value,
        ...(copied ? { reportId: copied.id } : {}),
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

export function researchAiQuestions(context: AiResearchContext, input: unknown) {
  return outcome(() => run(context, "prompt_research", promptResearchSchema.parse(input)));
}
