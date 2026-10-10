"use client";
import { CountrySelect } from "@/components/locations/CountrySelect";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { Textarea } from "@/components/ui/Textarea";
import type { AiResearchCatalog } from "@/lib/ai-research/catalog-types";
import {
  LEGACY_MODELS,
  LEGACY_OUTPUT_TOKENS,
  LEGACY_PRICING_CHECKED_AT,
} from "@/lib/ai-research/legacy";
import { useTranslations } from "next-intl";
import { Controller } from "react-hook-form";
import type { AiResearchForm } from "./AiVisibilityFields";
import { legacyModelOptions, legacyResearchInput } from "./ai-research-presets";

export function AiPromptFields({
  form,
  catalog,
  disabled,
}: Readonly<{ form: AiResearchForm; catalog?: AiResearchCatalog; disabled: boolean }>) {
  const t = useTranslations("projectAiResearch");
  const values = form.watch();
  const models = "models" in values ? (values.models ?? []) : [];
  const actual = "cost_policy" in values && values.cost_policy === "provider_actual_cost";
  const selected = catalog?.models.filter((model) => models.includes(model.id)) ?? [];
  const legacy = legacyResearchInput("prompt", values);
  const expanded =
    Boolean(catalog) &&
    selected.length === models.length &&
    selected.length > 0 &&
    selected.every((model) =>
      actual
        ? catalog?.actualCostAvailable && model.actualCostEnabled
        : model.priceAvailable && model.admissionEnabled,
    );
  const minTokens = expanded
    ? Math.max(16, ...selected.map((model) => model.minOutputTokens))
    : LEGACY_OUTPUT_TOKENS;
  const maxTokens = expanded
    ? Math.min(
        catalog?.limits.maxOutputTokens ?? 4096,
        ...selected.map((model) => model.maxOutputTokens),
      )
    : LEGACY_OUTPUT_TOKENS;
  function restorePreset() {
    form.setValue("cost_policy", "hard_cap");
    form.unregister([
      "actual_cost_acknowledgement",
      "estimated_cost_limit_cents",
      "idempotency_key",
      "estimate_credentials_ref",
    ]);
    form.setValue("max_cost_cents", 60);
    form.setValue("models", [...LEGACY_MODELS]);
    form.setValue("max_output_tokens", LEGACY_OUTPUT_TOKENS);
    form.setValue("web_search", false);
    form.setValue("country_iso_code", undefined);
    form.setValue("response_language", "en");
  }
  function chooseModel(index: number, value: string) {
    const next = [...models];
    next[index] = value;
    const distinct = next.filter(Boolean);
    form.setValue("models", distinct, { shouldValidate: true });
    const capabilities = catalog?.models.filter((model) => distinct.includes(model.id)) ?? [];
    const enabled =
      capabilities.length === distinct.length &&
      capabilities.every((model) =>
        actual
          ? catalog?.actualCostAvailable && model.actualCostEnabled
          : model.priceAvailable && model.admissionEnabled,
      );
    if (enabled && actual) {
      const minimum = Math.max(...capabilities.map((model) => model.minOutputTokens));
      const maximum = Math.min(...capabilities.map((model) => model.maxOutputTokens));
      form.setValue(
        "max_output_tokens",
        Math.max(
          minimum,
          Math.min(
            "max_output_tokens" in values ? (values.max_output_tokens ?? 512) : 512,
            maximum,
          ),
        ),
      );
      if (!capabilities.every((model) => model.webSearch)) {
        form.setValue("web_search", false);
        form.setValue("country_iso_code", undefined);
      }
    }
    if (!enabled) {
      form.setValue("max_output_tokens", LEGACY_OUTPUT_TOKENS);
      form.setValue("response_language", "en");
      form.setValue("web_search", false);
      form.setValue("country_iso_code", undefined);
    }
  }

  return (
    <>
      <div className="grid gap-2 text-ui-xs text-fg-muted sm:col-span-2">
        <span>
          {t(
            legacy
              ? "legacyPricingProvenance"
              : actual
                ? "actualCostPolicy"
                : "expandedPricingRequirement",
            {
              date: LEGACY_PRICING_CHECKED_AT,
            },
          )}
        </span>
        {!legacy ? (
          <Button type="button" variant="secondary" disabled={disabled} onClick={restorePreset}>
            {t("restoreLegacyPreset")}
          </Button>
        ) : null}
      </div>
      <label htmlFor="ai-prompt" className="grid gap-2 text-ui-body sm:col-span-2">
        {t("prompt")}
        <Textarea
          id="ai-prompt"
          {...form.register("prompt")}
          disabled={disabled}
          placeholder={t("promptPlaceholder")}
        />
      </label>
      {[0, 1].map((index) => (
        <div className="grid gap-2 text-ui-body" key={index}>
          <span>{t(index === 0 ? "firstModel" : "secondModel")}</span>
          <MenuSelect
            ariaLabel={t(index === 0 ? "firstModel" : "secondModel")}
            size="input"
            searchable
            disabled={disabled}
            value={models[index] ?? ""}
            onChange={(value) => chooseModel(index, value)}
            groups={[
              {
                id: "existing-preset",
                label: t("legacyPreset"),
                options: [
                  ...(index ? [{ label: t("noSecondModel"), value: "" }] : []),
                  ...legacyModelOptions.map((model) => ({
                    ...model,
                    disabled: models[1 - index] === model.value,
                  })),
                ],
              },
              {
                id: "live-catalog",
                label: t("liveCatalog"),
                options: (catalog?.models ?? [])
                  .filter((model) => !LEGACY_MODELS.some((id) => id === model.id))
                  .map((model) => ({
                    label: model.label,
                    value: model.id,
                    secondary: model.reasoning ? t("reasoningModel") : undefined,
                    disabled:
                      (actual
                        ? !model.actualCostEnabled || !catalog?.actualCostAvailable
                        : !model.priceAvailable || !model.admissionEnabled) ||
                      models[1 - index] === model.id,
                    tooltip: actual
                      ? !model.actualCostEnabled
                        ? t("modelPolicyPending")
                        : undefined
                      : !model.priceAvailable
                        ? t("unknownPrice")
                        : !model.admissionEnabled
                          ? t("modelPolicyPending")
                          : undefined,
                    searchText: model.id,
                  })),
              },
            ]}
          />
        </div>
      ))}
      <Controller
        name="response_language"
        control={form.control}
        render={({ field }) => (
          <div className="grid gap-2 text-ui-body">
            <span>{t("responseLanguage")}</span>
            <MenuSelect
              ariaLabel={t("responseLanguage")}
              size="input"
              searchable
              disabled={disabled || !expanded}
              value={field.value ?? "en"}
              onChange={field.onChange}
              options={(expanded
                ? (catalog?.responseLanguages ?? [])
                : [{ code: "en", name: t("legacyPromptLanguage") }]
              ).map((language) => ({
                label: legacy && language.code === "en" ? t("legacyPromptLanguage") : language.name,
                value: language.code,
                searchText: language.code,
              }))}
            />
            <span className="text-ui-xs text-fg-muted">
              {t(legacy ? "legacyPromptLanguageHint" : "responseLanguageHint")}
            </span>
          </div>
        )}
      />
      <label htmlFor="ai-output-tokens" className="grid gap-2 text-ui-body">
        {t("outputTokens")}
        <Input
          id="ai-output-tokens"
          aria-label={t("outputTokens")}
          aria-describedby="ai-output-token-bounds"
          type="number"
          min={minTokens}
          max={maxTokens}
          disabled={disabled || !expanded}
          {...form.register("max_output_tokens", { valueAsNumber: true })}
        />
        <span id="ai-output-token-bounds" className="text-ui-xs text-fg-muted">
          {t("tokenBounds", { min: minTokens, max: maxTokens })}
        </span>
      </label>
      <Controller
        name="web_search"
        control={form.control}
        render={({ field }) => (
          <Checkbox
            containerClassName="sm:col-span-2"
            label={t("webSearch")}
            aria-label={t("webSearch")}
            aria-describedby="ai-web-search-hint"
            description={
              <span id="ai-web-search-hint">
                {t(actual ? "actualSearchForecast" : "webSearchPolicyPending")}
              </span>
            }
            checked={field.value ?? false}
            onChange={(event) => {
              field.onChange(event.target.checked);
              form.setValue(
                "country_iso_code",
                event.target.checked
                  ? (catalog?.responseCountries.find((country) => country.code === "US")?.code ??
                      catalog?.responseCountries[0]?.code)
                  : undefined,
              );
            }}
            disabled={
              disabled || !actual || !expanded || !selected.every((model) => model.webSearch)
            }
          />
        )}
      />
      {"web_search" in values && values.web_search ? (
        <Controller
          name="country_iso_code"
          control={form.control}
          render={({ field }) => (
            <div className="grid gap-2 text-ui-body">
              <span>{t("searchCountry")}</span>
              <CountrySelect
                ariaLabel={t("searchCountry")}
                size="input"
                disabled={disabled}
                countries={(catalog?.responseCountries ?? []).map((country) => ({
                  code: country.code,
                  label: country.name,
                }))}
                value={field.value ?? ""}
                onChange={field.onChange}
              />
              <span className="text-ui-xs text-fg-muted">{t("searchCountryHint")}</span>
            </div>
          )}
        />
      ) : null}
    </>
  );
}
