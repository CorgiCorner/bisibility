"use client";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/ToggleGroup";
import { type AiEngine, isAiEngine } from "@/lib/ai-research/engines";
import { LEGACY_MODELS, LEGACY_OUTPUT_TOKENS } from "@/lib/ai-research/legacy";
import { useTranslations } from "next-intl";
import type { AiResearchForm } from "./AiVisibilityFields";
import { aiResearchDefaults } from "./ai-research-presets";

export type AiEngineOption = { engine: AiEngine; model: string };
const ENGINE_LABEL_KEYS = {
  chat_gpt: "engineChatGpt",
  claude: "engineClaude",
  gemini: "engineGemini",
  perplexity: "enginePerplexity",
} as const;

export function engineLabelKey(engine: AiEngine) {
  return ENGINE_LABEL_KEYS[engine];
}
const engineChipClass = [
  "ml-0 h-auto min-h-[34px] flex-col items-start gap-0",
  "whitespace-normal rounded-control px-2.5 py-1 leading-tight",
].join(" ");
export function defaultSelectedEngines(options: readonly AiEngineOption[]): AiEngine[] {
  const match = options.find((option) => option.engine === "chat_gpt") ?? options[0];
  return match ? [match.engine] : [];
}
type ResearchDefaults = ReturnType<typeof aiResearchDefaults>;
export function researchDefaults(
  mode: "prompt" | "visibility",
  domain: string,
  engineOptions: readonly AiEngineOption[],
): ResearchDefaults {
  const defaults = aiResearchDefaults(mode, domain);
  if (mode !== "prompt" || engineOptions.length === 0 || !("prompt" in defaults)) return defaults;
  const { models: _models, max_output_tokens: _tokens, ...rest } = defaults;
  return { ...rest, engines: defaultSelectedEngines(engineOptions) } as ResearchDefaults;
}
export function AiEngineFields({
  form,
  engineOptions,
  disabled,
}: Readonly<{
  form: AiResearchForm;
  engineOptions: readonly AiEngineOption[];
  disabled: boolean;
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
  return (
    <div className="grid min-w-0 gap-2 sm:col-span-2">
      <SegmentedControl
        ariaLabel={t("aiEngines")}
        // The UA fieldset margin would shift this label 2px off the form's label edge.
        className="m-0"
        disabled={disabled}
        fitContent
        label={t("aiEngines")}
        labelClassName="text-ui-body"
        onChange={selectMode}
        options={[
          { label: t("enginesMode"), value: "engines" },
          { label: t("modelsMode"), value: "models" },
        ]}
        size="field"
        value={engineMode ? "engines" : "models"}
      />
      {engineMode ? (
        <>
          <ToggleGroup
            aria-label={t("aiEngines")}
            className="w-full flex-wrap gap-2"
            disabled={disabled}
            onValueChange={(next) => {
              const engines = next.filter(isAiEngine);
              if (!engines.length) return;
              form.setValue("engines", engines);
            }}
            type="multiple"
            value={selected}
          >
            {engineOptions.map((option) => (
              <ToggleGroupItem
                aria-label={`${t(engineLabelKey(option.engine))} ${option.model}`}
                className={engineChipClass}
                key={option.engine}
                value={option.engine}
              >
                <span>{t(engineLabelKey(option.engine))}</span>
                <span className="text-[11px] font-normal text-fg-muted">{option.model}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <span className="text-ui-xs text-fg-muted">{t("engineModeHint")}</span>
        </>
      ) : null}
    </div>
  );
}
