"use server";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { recordAppAction } from "@/lib/activity/app-mutation";
import { requireAiSource } from "@/lib/ai-research/context";
import { acceptResearchedPrompts } from "@/lib/ai-research/prompt-research-accept";
import { researchProjectState } from "@/lib/ai-research/prompt-research-project";
import { projectResearchQuestions } from "@/lib/ai-research/prompt-research-projection";
import { promptResearchSchema } from "@/lib/ai-research/prompt-research-schema";
import { researchAiQuestions } from "@/lib/ai-research/service";
import { aiVisibilityPath } from "@/lib/ai-tracking/ai-visibility-paths";
import { canWriteAiTracking } from "@/lib/ai-tracking/projections/schedule-list";
import { auditTrackingAcceptance, auditTrackingCatalog } from "@/lib/api/ai-tracking-audit";
import { trackingScope } from "@/lib/api/ai-tracking-service";
import { getProjectRole } from "@/lib/auth/authorize";
import { withCapacityFailure } from "@/lib/capacity/action";
import { reuseWindowLabel } from "@/lib/project-data-cache/duration";
import { effectiveProjectLookupTtl } from "@/lib/provider-lookups/effective-lookup-ttl";
import { ProviderLookupSignal } from "@/lib/provider-lookups/paid-call";
import { APP_REQUEST_ORIGIN } from "@/lib/provider-usage/surface";
import { moduleSupport } from "@/lib/providers/module-support";
import { budgetFailureResult } from "@/lib/rank-check/budget-failure";
import { revalidatePath } from "next/cache";
import { createTranslator } from "next-intl";
import { getActionActor } from "./_shared";

export async function getPromptResearchPage(projectId: string, keyword?: string) {
  const actor = await getActionActor();
  const project = await trackingScope(actor, projectId);
  const state = await researchProjectState(project.id);
  const cacheTtl = effectiveProjectLookupTtl(state.lookupCacheTtlSeconds, "prompt_research");
  const { locale } = await resolveRegionalDocumentLocale();
  const durationT = createTranslator({
    locale,
    messages: await loadCoreMessages(locale, ["projectSettingsGeneral"]),
    namespace: "projectSettingsGeneral.dataCache",
  });
  const canWrite = canWriteAiTracking(getProjectRole(actor, project.id), project.writeMode);
  let hasSource = true;
  try {
    await requireAiSource(project.id);
  } catch (error) {
    if (!(error instanceof ProviderLookupSignal) || error.outcome.reason !== "no_source")
      throw error;
    hasSource = false;
  }
  // Source resolution and cache-only access never dispatch a provider request.
  const cached =
    hasSource && keyword && canWrite && keyword.trim().length <= 100
      ? await lookupPromptResearchAction(projectId, { keyword, max_cost_cents: 0 })
      : undefined;
  return {
    canWrite,
    hasSource,
    cacheDuration: reuseWindowLabel(cacheTtl, durationT),
    ...moduleSupport("aiResearch"),
    topics: state.topics,
    keywords: state.keywords,
    initial: cached?.ok && !cached.estimate ? cached : undefined,
  };
}
export async function lookupPromptResearchAction(projectId: string, value: unknown) {
  const input = promptResearchSchema.parse(value);
  const actor = await getActionActor();
  const project = await trackingScope(actor, projectId, true);
  try {
    const outcome = await researchAiQuestions(
      { projectId: project.id, actorId: actor.id, origin: APP_REQUEST_ORIGIN },
      {
        ...input,
        require_payment: !input.estimate_only,
      },
    );
    if (!outcome.ok || outcome.estimate) return outcome;
    if (!outcome.cached && !input.estimate_only && input.max_cost_cents !== 0)
      recordAppAction(actor);
    const state = await researchProjectState(project.id);

    return { ...outcome, prompts: projectResearchQuestions(outcome.result.rows, state) };
  } catch (error) {
    const budget = budgetFailureResult(error);
    if (budget) return { ok: false as const, reason: budget.code, message: budget.message };
    throw error;
  }
}
export async function trackPromptResearchAction(projectId: string, value: unknown) {
  return withCapacityFailure(async () => {
    const actor = await getActionActor();
    const project = await trackingScope(actor, projectId, true);
    const result = await acceptResearchedPrompts(project.id, value, (resource, saved, tx) =>
      auditTrackingCatalog(actor, project, resource, "POST", {}, saved, tx),
    );
    if (result.added > 0) recordAppAction(actor);
    await auditTrackingAcceptance(actor, project, result.added);
    revalidatePath(aiVisibilityPath(projectId));

    return { added: result.added, topics: result.state.topics, tracked: result.state.tracked };
  });
}

export type PromptResearchPageData = Omit<
  Awaited<ReturnType<typeof getPromptResearchPage>>,
  "initial"
> & {
  initial?: Awaited<ReturnType<typeof lookupPromptResearchAction>>;
};
