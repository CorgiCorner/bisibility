import "server-only";
import { paidProviderCall, preflightProviderBudget } from "@/lib/provider-lookups/paid-call";
import { surfaceOf } from "@/lib/provider-usage/surface";
import type { AiAdmission } from "./admission";
import { admissionRate, admittedModelCost } from "./admission";
import type { AiModelCapability } from "./catalog-types";
import type { requireAiSource } from "./context";
import { assertAiDeadline } from "./deadline";
import { researchFailure } from "./failure";
import { fetchObserved, fetchPrompt, supportedPromptModels } from "./provider";
import type { AiResearchKind, PromptInput, VisibilityInput } from "./schema";
import type { AiResearchContext } from "./service";
import type { AiResearchResult, AiResearchRow } from "./types";

export async function executeResearch({
  context,
  kind,
  input,
  source,
  admitted,
  deadlineAt,
  onUsageTag,
  onPaidDispatch,
  onNoPaidDispatch,
}: {
  context: AiResearchContext;
  kind: AiResearchKind;
  input: PromptInput | VisibilityInput;
  source: Awaited<ReturnType<typeof requireAiSource>>;
  admitted: AiAdmission;
  deadlineAt: number;
  onUsageTag?: (tag: string) => Promise<void>;
  onPaidDispatch?: () => void;
  onNoPaidDispatch?: (tag: string) => Promise<void>;
}): Promise<{ result: AiResearchResult; providerRequestIds: string[] }> {
  const estimate = admitted.estimate;
  const limit =
    "prompt" in input && input.cost_policy === "provider_actual_cost"
      ? input.estimated_cost_limit_cents!
      : input.max_cost_cents!;
  const evidence = kind === "ai_visibility" ? "observed_dataset" : "synthetic_prompt_test";
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
    trigger: context.execution?.trigger ?? ("manual" as const),
  };
  let costCents = 0;
  let totalAvailable: number | null = null;
  let failure: string | null = null;
  let costStatus: "confirmed" | "unknown" = "confirmed";
  const rows: AiResearchRow[] = [];
  const providerRequestIds: string[] = [];
  let supported: ReadonlyMap<string, AiModelCapability> | ReadonlySet<string> | undefined;
  let dispatched = false;
  let currentUsageTag: string | undefined;
  const markDispatched = () => {
    dispatched = true;
    onPaidDispatch?.();
  };
  try {
    if ("prompt" in input) {
      for (const model of input.models) {
        dispatched = false;
        currentUsageTag = undefined;
        assertAiDeadline(deadlineAt);
        const answer = await paidProviderCall({
          ...common,
          ...(context.execution
            ? {
                correlationId:
                  input.models.length === 1
                    ? context.execution.correlationId
                    : `${context.execution.correlationId}:${input.models.indexOf(model)}`,
              }
            : {}),
          ...(admitted.policy === "provider_actual_cost"
            ? { requiredCredentialSource: "own" as const }
            : {}),
          rate: admissionRate(admitted, kind, admittedModelCost(admitted, model, input)),
          call: async (credentials, usage) => {
            currentUsageTag = usage.tag;
            await onUsageTag?.(usage.tag);
            supported ??=
              admitted.policy === "legacy_dated"
                ? await supportedPromptModels(credentials, deadlineAt)
                : new Map(admitted.capabilities.catalog.models.map((entry) => [entry.id, entry]));
            return fetchPrompt(
              credentials,
              input,
              model,
              usage.tag,
              deadlineAt,
              supported,
              markDispatched,
            );
          },
        });
        if (answer.providerRequestId) providerRequestIds.push(answer.providerRequestId);
        costCents += answer.costCents;
        rows.push(answer.row);
        if (admitted.policy === "provider_actual_cost" ? costCents >= limit : costCents > limit)
          break;
      }
    } else {
      assertAiDeadline(deadlineAt);
      const observations = await paidProviderCall({
        ...common,
        ...(context.execution ? { correlationId: context.execution.correlationId } : {}),
        rate: admissionRate(admitted, kind, estimate),
        call: (credentials, usage) =>
          fetchObserved(credentials, input, usage.tag, deadlineAt, markDispatched),
      });
      if (observations.providerRequestId) providerRequestIds.push(observations.providerRequestId);
      costCents = observations.costCents;
      totalAvailable = observations.totalAvailable;
      rows.push(...observations.rows);
    }
  } catch (error) {
    if (!dispatched && currentUsageTag) await onNoPaidDispatch?.(currentUsageTag);
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
  return { result, providerRequestIds };
}
