import type { AssistantEffort } from "@/lib/assistant/effort";
import { fundingServes, resolveAssistantFunding } from "@/lib/assistant/funding-resolve";
import { assistantOutputLimitChoices } from "@/lib/assistant/limits";
import type {
  AssistantConfigView,
  AssistantProvider,
  FundingChoice,
  ModelView,
} from "@/lib/assistant/wire";
import type { AssistantSelection } from "./selection-store";

/** Who pays for a provider's models: the stored choice, else the default rule, and whether it can serve. */
export function providerFunding(
  config: AssistantConfigView,
  provider: AssistantProvider,
): { choice: FundingChoice; serves: boolean } {
  const choice = resolveAssistantFunding({
    stored: config.fundingPreference.find((item) => item.provider === provider)?.mode ?? null,
    provider,
    options: config.funding,
    creditsEnabled: config.creditsEnabled,
  });
  const option = config.funding.find(
    (item) => item.provider === choice.provider && item.mode === choice.mode,
  );
  return { choice, serves: fundingServes(option) };
}

/** Tool-capable models grouped by provider, in catalog order. */
export function modelsByProvider(models: readonly ModelView[]) {
  const groups = new Map<AssistantProvider, ModelView[]>();
  for (const model of models)
    groups.set(model.provider, [...(groups.get(model.provider) ?? []), model]);
  return [...groups].map(([provider, items]) => ({ provider, models: items }));
}

/**
 * The model, effort and token limit the composer sends with: the stored pick when the catalog
 * still offers it, otherwise the project default model, its default effort and its own maximum.
 */
export function composerChoice(
  config: AssistantConfigView | undefined,
  selection: AssistantSelection,
) {
  const models = config?.models.filter((item) => item.toolUse) ?? [];
  const model =
    models.find((item) => item.id === selection.modelId) ??
    models.find((item) => item.id === config?.defaults.modelId) ??
    models[0];
  const efforts: AssistantEffort[] = model?.efforts ?? [];
  const effort =
    selection.effort && efforts.includes(selection.effort)
      ? selection.effort
      : (model?.defaultEffort ?? efforts[0] ?? null);
  const funding = config && model ? providerFunding(config, model.provider) : null;
  const modelMax = model?.maxOutputTokens ?? null;
  const limits = modelMax ? assistantOutputLimitChoices(modelMax) : [];
  const stored = selection.maxOutputTokens;
  return {
    limits,
    /** The token limit sent with the turn; null sends none, so the model maximum applies. */
    maxOutputTokens: stored && modelMax && stored < modelMax ? stored : null,
    models,
    model,
    efforts,
    effort: efforts.length ? effort : null,
    funding: funding?.choice ?? null,
    fundingBlocked: Boolean(funding && !funding.serves),
  };
}
