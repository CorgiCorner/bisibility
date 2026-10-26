"use client";
import { Button } from "@/components/ui/Button";
import { ChoiceGroup } from "@/components/ui/ChoiceGroup";
import type { AiResearchCatalog } from "@/lib/ai-research/catalog-types";
import { aiEngineLabel } from "@/lib/ai-research/engine-labels";
import { AI_ENGINES, type AiEngine, isAiEngine } from "@/lib/ai-research/engines";
import { LEGACY_MODELS, LEGACY_OUTPUT_TOKENS } from "@/lib/ai-research/legacy";
import { useTranslations } from "next-intl";
import type { AiResearchForm } from "./AiVisibilityFields";
import { aiResearchDefaults } from "./ai-research-presets";

export type AiEngineOption = { engine: AiEngine; model: string };
export function defaultSelectedEngines(options: readonly AiEngineOption[]): AiEngine[] {
  const match = options.find((option) => option.engine === "chat_gpt") ?? options[0];
  return match ? [match.engine] : [];
}
type ResearchDefaults = ReturnType<typeof aiResearchDefaults>;
export function researchDefaults(
  mode: "prompt" | "visibility",
  domain: string,
  engineOptions: readonly AiEngineOption[],
  catalog?: AiResearchCatalog,
): ResearchDefaults {
  const defaults = aiResearchDefaults(mode, domain);
  if (mode !== "prompt" || !("prompt" in defaults)) return defaults;
  if (engineOptions.length) {
    const { models: _models, max_output_tokens: _tokens, ...rest } = defaults;
    return { ...rest, engines: defaultSelectedEngines(engineOptions) } as ResearchDefaults;
  }
  const model = ["gpt-6-luna", "gpt-5.6-luna"]
    .map((id) =>
      catalog?.models.find(
        (entry) => entry.id === id && entry.priceAvailable && entry.actualCostEnabled,
      ),
    )
    .find(Boolean);
  if (!catalog?.actualCostAvailable || !model) return defaults;
  const { max_cost_cents: _cap, ...rest } = defaults;
  return {
    ...rest,
    models: [model.id],
    cost_policy: "provider_actual_cost",
    max_output_tokens: Math.max(1024, model.minOutputTokens),
    estimated_cost_limit_cents: 60,
  } as ResearchDefaults;
}
export function AiEngineFields({
  form,
  engineOptions,
  disabled,
  advanced = false,
  onSelectionChange,
}: Readonly<{
  form: AiResearchForm;
  engineOptions: readonly AiEngineOption[];
  disabled: boolean;
  advanced?: boolean;
  onSelectionChange?: () => void;
}>) {
  const t = useTranslations("projectAiResearch");
  const values = form.watch();
  const selected =
    "engines" in values && Array.isArray(values.engines) ? values.engines.filter(isAiEngine) : [];
  const engineMode = selected.length > 0;
  if (!engineOptions.length) return null;
  function activateEngines() {
    const current = form.getValues();
    const cap = "max_cost_cents" in current ? current.max_cost_cents : undefined;
    const existing =
      "engines" in current && Array.isArray(current.engines) && current.engines.length > 0
        ? current.engines.filter(isAiEngine)
        : defaultSelectedEngines(engineOptions);
    form.setValue("cost_policy", "hard_cap");
    form.setValue("web_search", false);
    form.setValue("country_iso_code", undefined);
    form.unregister([
      "actual_cost_acknowledgement",
      "estimated_cost_limit_cents",
      "idempotency_key",
      "estimate_credentials_ref",
      "models",
      "max_output_tokens",
    ]);
    form.setValue("max_cost_cents", typeof cap === "number" && Number.isFinite(cap) ? cap : 60);
    form.setValue("engines", existing);
  }
  function activateModels() {
    form.setValue("cost_policy", "hard_cap");
    form.unregister([
      "engines",
      "actual_cost_acknowledgement",
      "estimated_cost_limit_cents",
      "idempotency_key",
      "estimate_credentials_ref",
    ]);
    form.setValue("models", [...LEGACY_MODELS]);
    form.setValue("max_output_tokens", LEGACY_OUTPUT_TOKENS);
    form.setValue("web_search", false);
    form.setValue("country_iso_code", undefined);
    form.setValue("response_language", "en");
  }
  function selectMode(mode: "engines" | "models") {
    if (mode === "engines" && engineMode) return;
    if (mode === "models" && !engineMode) return;
    if (mode === "engines") activateEngines();
    else activateModels();
  }
  if (advanced)
    return engineMode ? (
      <Button type="button" variant="secondary" disabled={disabled} onClick={activateModels}>
        {t("chooseModels")}
      </Button>
    ) : null;
  return (
    <div className="grid min-w-0 gap-2 sm:col-span-2">
      {engineMode ? (
        <>
          <ChoiceGroup
            label={t("aiEngines")}
            disabled={disabled}
            mode="multiple"
            max={AI_ENGINES.length}
            maxHint={t("engineLimit", { max: AI_ENGINES.length })}
            value={selected}
            onChange={(engines) => {
              if (!engines.length) return;
              form.setValue("engines", engines, { shouldValidate: true });
              onSelectionChange?.();
            }}
            options={AI_ENGINES.map((engine) => {
              const option = engineOptions.find((entry) => entry.engine === engine);
              return {
                value: engine,
                label: aiEngineLabel(engine),
                description: option?.model,
                disabledReason: option ? undefined : t("engineUnavailable"),
              };
            })}
          />
          <span className="text-ui-xs text-fg-muted">{t("engineModeHint")}</span>
        </>
      ) : (
        <Button
          type="button"
          variant="secondary"
          disabled={disabled}
          onClick={() => selectMode("engines")}
        >
          {t("useEngines")}
        </Button>
      )}
    </div>
  );
}
