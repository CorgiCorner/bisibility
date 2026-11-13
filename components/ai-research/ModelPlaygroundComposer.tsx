"use client";

import { ActionPaymentOptionPicker } from "@/components/action-payment/ActionPaymentOptionPicker";
import { CountrySelect } from "@/components/locations/CountrySelect";
import { Button } from "@/components/ui/Button";
import { ChoiceGroup } from "@/components/ui/ChoiceGroup";
import { FormField } from "@/components/ui/FieldLabel";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { StatusChip } from "@/components/ui/StatusChip";
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";
import type { ActionPaymentOption } from "@/lib/action-payment/contract";
import type { AiResearchCatalog } from "@/lib/ai-research/catalog-types";
import { appPath } from "@/lib/routing/app-path";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Controller } from "react-hook-form";
import { AiCostPolicyFields } from "./AiCostPolicyFields";
import { AiEngineFields, type AiEngineOption } from "./AiEngineFields";
import { AiResearchCostCap } from "./AiResearchCostCap";
import type { AiResearchForm } from "./AiVisibilityFields";
import { ModelPlaygroundSuggestions } from "./ModelPlaygroundHistory";

export function ModelPlaygroundComposer({
  form,
  projectId,
  catalog,
  engineOptions,
  disabled,
  pending,
  runDisabled,
  estimateText,
  paymentOptions,
  paymentOptionId,
  funding,
  onOptionChange,
  onRun,
  onCatalogInteract,
}: Readonly<{
  form: AiResearchForm;
  projectId: string;
  catalog?: AiResearchCatalog;
  engineOptions: readonly AiEngineOption[];
  disabled: boolean;
  pending: boolean;
  runDisabled: boolean;
  estimateText: string | null;
  paymentOptions: ActionPaymentOption[];
  paymentOptionId?: string;
  funding: "byok" | "platform" | null;
  onOptionChange: (id: string) => void;
  onRun: () => void;
  onCatalogInteract: () => void;
}>) {
  const t = useTranslations("projectAiResearch");
  const [promptFocused, setPromptFocused] = useState(false);
  const values = form.watch();
  const promptField = form.register("prompt");
  const prompt = "prompt" in values ? (values.prompt ?? "") : "";
  const engineMode = "engines" in values && (values.engines?.length ?? 0) > 0;
  const models = "models" in values ? (values.models ?? []) : [];
  const actual = "cost_policy" in values && values.cost_policy === "provider_actual_cost";
  const selected = catalog?.models.filter((model) => models.includes(model.id)) ?? [];
  const expanded =
    Boolean(catalog) &&
    selected.length === models.length &&
    selected.length > 0 &&
    selected.every((model) =>
      actual
        ? catalog?.actualCostAvailable && model.actualCostEnabled
        : model.priceAvailable && model.admissionEnabled,
    );
  const searchDisabled = engineMode
    ? disabled
    : disabled || !actual || !expanded || !selected.every((model) => model.webSearch);
  const searchNeedsKey = !engineMode && !actual;
  const searchHint = t(
    engineMode ? "engineWebSearchHint" : actual ? "actualSearchForecast" : "webSearchPolicyPending",
  );
  const selectable = (catalog?.models ?? []).filter(
    (model) => model.priceAvailable && model.admissionEnabled,
  );
  return (
    <form
      className="grid gap-4 lg:grid-cols-3"
      onChange={onCatalogInteract}
      onFocus={onCatalogInteract}
      onSubmit={(event) => {
        event.preventDefault();
        onRun();
      }}
    >
      <input type="hidden" {...form.register("brand")} />
      <input type="hidden" {...form.register("domain")} />
      <div data-composer-row="prompt">
        <FormField className="relative" htmlFor="model-playground-prompt" label={t("prompt")}>
          <Textarea
            disabled={disabled}
            id="model-playground-prompt"
            maxLength={500}
            placeholder={t("promptPlaceholder")}
            {...promptField}
            onBlur={(event) => {
              void promptField.onBlur(event);
              setPromptFocused(false);
            }}
            onFocus={() => setPromptFocused(true)}
          />
          <ModelPlaygroundSuggestions
            focused={promptFocused}
            projectId={projectId}
            prompt={prompt}
          />
        </FormField>
      </div>
      <div
        className="grid items-start gap-4 sm:grid-cols-2 lg:col-span-2"
        data-composer-row="controls"
      >
        <div className="grid min-w-0 gap-2">
          <Controller
            control={form.control}
            name="response_language"
            render={({ field }) => (
              <FormField label={t("responseLanguage")} caption={t("responseLanguageHint")}>
                <MenuSelect
                  ariaLabel={t("responseLanguage")}
                  disabled={disabled || (!expanded && !(engineMode && catalog))}
                  onChange={field.onChange}
                  options={(expanded || (engineMode && catalog)
                    ? (catalog?.responseLanguages ?? [])
                    : [{ code: "en", name: t("legacyPromptLanguage") }]
                  ).map((language) => ({
                    label: language.name,
                    searchText: language.code,
                    value: language.code,
                  }))}
                  searchable
                  size="input"
                  value={field.value ?? "en"}
                />
              </FormField>
            )}
          />
        </div>
        <FormField
          label={t("webSearchLabel")}
          help={searchHint}
          captionId="model-playground-web-search-hint"
          caption={
            searchNeedsKey
              ? t.rich("webSearchNeedsKey", {
                  link: (chunks) => (
                    <Link
                      className="underline underline-offset-2"
                      href={appPath(projectId, "settings", "advanced")}
                    >
                      {chunks}
                    </Link>
                  ),
                })
              : t(engineMode ? "webSearchIncluded" : "webSearchOwnKey")
          }
        >
          <Controller
            control={form.control}
            name="web_search"
            render={({ field }) => (
              <div className="flex h-10 items-center max-sm:h-11">
                <Switch
                  checked={field.value ?? false}
                  className="w-fit border-0 bg-transparent p-0"
                  disabled={searchDisabled}
                  label={t("webSearch")}
                  onChange={(event) => {
                    field.onChange(event.target.checked);
                    form.setValue(
                      "country_iso_code",
                      event.target.checked
                        ? (catalog?.responseCountries.find((country) => country.code === "US")
                            ?.code ?? catalog?.responseCountries[0]?.code)
                        : undefined,
                    );
                  }}
                />
              </div>
            )}
          />
        </FormField>
      </div>
      <div className="col-span-full space-y-4" data-composer-row="details">
        {"web_search" in values && values.web_search ? (
          <Controller
            control={form.control}
            name="country_iso_code"
            render={({ field }) => (
              <div className="grid w-full max-w-sm gap-2 text-ui-body">
                <span>{t("searchCountry")}</span>
                <CountrySelect
                  ariaLabel={t("searchCountry")}
                  countries={(catalog?.responseCountries ?? []).map((country) => ({
                    code: country.code,
                    label: country.name,
                  }))}
                  disabled={disabled}
                  onChange={field.onChange}
                  size="input"
                  value={field.value ?? ""}
                />
              </div>
            )}
          />
        ) : null}
        {paymentOptions.length > 0 ? (
          <div className="grid gap-2 text-ui-body">
            <span>{t("modelPlayground.payWith")}</span>
            <ActionPaymentOptionPicker
              size="input"
              disabled={disabled}
              onChange={onOptionChange}
              options={paymentOptions}
              value={paymentOptionId ?? paymentOptions[0]?.id ?? ""}
            />
          </div>
        ) : null}
        {engineOptions.length ? (
          <AiEngineFields
            disabled={disabled}
            engineOptions={engineOptions}
            form={form}
            label={t("modelPlayground.samePrompt", {
              count: "engines" in values ? (values.engines?.length ?? 0) : 0,
            })}
          />
        ) : selectable.length ? (
          <ChoiceGroup
            disabled={disabled}
            label={t("modelPlayground.sameModels", { count: models.length })}
            max={catalog?.limits.maxModels ?? 2}
            maxHint={t("modelLimit")}
            mode="multiple"
            onChange={(next) => {
              if (!next.length) return;
              form.setValue("models", next, { shouldValidate: true });
            }}
            options={selectable.map((model) => ({ label: model.label, value: model.id }))}
            value={models}
          />
        ) : null}
        {engineMode ? (
          <AiResearchCostCap className="max-w-sm" disabled={disabled} form={form} />
        ) : (
          <AiCostPolicyFields
            catalog={catalog}
            className="max-w-sm"
            disabled={disabled}
            form={form}
          />
        )}
        {Object.values(form.formState.errors).length ? (
          <p className="text-ui-body text-red-text" role="alert">
            {t("validation")}
          </p>
        ) : null}
      </div>
      <div
        className="col-span-full flex flex-wrap items-center gap-3 border-t border-border pt-4"
        data-composer-row="footer"
      >
        <Button disabled={runDisabled} loading={pending} size="input" type="submit">
          {t("modelPlayground.run")}
        </Button>
        {estimateText ? (
          <span className="text-ui-body tabular-nums text-fg-muted">{estimateText}</span>
        ) : null}
        {funding ? (
          <StatusChip
            dot={false}
            label={t(funding === "byok" ? "modelPlayground.yourKey" : "modelPlayground.credits")}
            tone={funding === "byok" ? "info" : "positive"}
          />
        ) : null}
      </div>
    </form>
  );
}
