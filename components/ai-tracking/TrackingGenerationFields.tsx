"use client";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { Textarea } from "@/components/ui/Textarea";
import type { AiCatalogOutcome } from "@/lib/ai-research/catalog-types";
import type {
  modelSuggestionsPreviewInputSchema,
  SuggestionGenerationSnapshot,
} from "@/lib/ai-tracking/suggestions/generation-schema";
import { serpCountryCatalog } from "@/lib/serp/country-catalog";
import { serpLanguageCatalog } from "@/lib/serp/generated/serp-language-catalog";
import { useTranslations } from "next-intl";
import { type Control, Controller, type UseFormRegister } from "react-hook-form";
import type { z } from "zod";
import { TrackingModelControl } from "./TrackingModelControl";

export function TrackingGenerationFields({
  control,
  register,
  competitors,
  onInvalidate,
  onCatalog,
}: Readonly<{
  control: Control<
    z.input<typeof modelSuggestionsPreviewInputSchema>,
    unknown,
    z.output<typeof modelSuggestionsPreviewInputSchema>
  >;
  register: UseFormRegister<z.input<typeof modelSuggestionsPreviewInputSchema>>;
  competitors: SuggestionGenerationSnapshot["competitors"];
  onInvalidate: () => void;
  onCatalog?: () => Promise<AiCatalogOutcome>;
}>) {
  const t = useTranslations("projectAiTracking");
  return (
    <>
      <p className="text-xs leading-5 text-fg-muted">{t("generationReviewMethod")}</p>
      {(["business", "audience", "products", "goals", "agentRules"] as const).map((field) => (
        <label key={field} htmlFor={`generation-${field}`} className="flex flex-col gap-2 text-sm">
          {t(
            field === "agentRules"
              ? "generationAgentRules"
              : field === "business"
                ? "generationBusiness"
                : field === "audience"
                  ? "generationAudience"
                  : field === "products"
                    ? "generationProducts"
                    : "generationGoals",
          )}
          <Textarea
            id={`generation-${field}`}
            rows={3}
            {...register(`inputSnapshot.context.${field}`)}
          />
        </label>
      ))}
      <fieldset className="space-y-2 rounded-control border border-border p-3">
        <legend className="px-1 text-sm">{t("generationCompetitors")}</legend>
        <Controller
          name="inputSnapshot.competitors"
          control={control}
          render={({ field }) => (
            <>
              {competitors.length ? (
                competitors.map((competitor) => (
                  <Checkbox
                    key={competitor.id}
                    checked={field.value.some((item) => item.id === competitor.id)}
                    label={`${competitor.label ?? competitor.domain} (${competitor.domain})`}
                    onChange={(event) => {
                      field.onChange(
                        event.target.checked
                          ? [...field.value, competitor]
                          : field.value.filter((item) => item.id !== competitor.id),
                      );
                      onInvalidate();
                    }}
                  />
                ))
              ) : (
                <p className="text-xs text-fg-muted">{t("generationNoCompetitors")}</p>
              )}
            </>
          )}
        />
      </fieldset>
      <p className="text-sm font-medium">{t("generationProvider")}: DataForSEO · ChatGPT</p>
      <Controller
        name="configuration.model"
        control={control}
        render={({ field }) => (
          <TrackingModelControl
            value={field.value}
            onCatalog={onCatalog}
            onChange={(value) => {
              field.onChange(value);
              onInvalidate();
            }}
          />
        )}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Controller
          name="configuration.languageCode"
          control={control}
          render={({ field }) => (
            <MenuSelect
              ariaLabel={t("languageCode")}
              searchable
              value={field.value}
              size="input"
              options={serpLanguageCatalog.map((language) => ({
                value: language.code,
                label: language.label,
              }))}
              onChange={(value) => {
                field.onChange(value);
                onInvalidate();
              }}
            />
          )}
        />
        <Controller
          name="configuration.countryIsoCode"
          control={control}
          render={({ field }) => (
            <MenuSelect
              ariaLabel={t("generationCountry")}
              searchable
              value={field.value ?? ""}
              size="input"
              options={[
                { value: "", label: t("generationNoCountry") },
                ...serpCountryCatalog.map((country) => ({
                  value: country.countryCode,
                  label: country.displayName,
                })),
              ]}
              onChange={(value) => {
                field.onChange(value || undefined);
                onInvalidate();
              }}
            />
          )}
        />
      </div>
      <p className="text-xs text-fg-muted">{t("generationMarketMethod")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm" htmlFor="generation-tokens">
          {t("generationOutputTokens")}
          <Input
            id="generation-tokens"
            type="number"
            min={16}
            max={4096}
            {...register("configuration.maxOutputTokens", { valueAsNumber: true })}
          />
        </label>
        <label className="text-sm" htmlFor="generation-cost">
          {t("generationAdvisoryLimit")}
          <Input
            id="generation-cost"
            type="number"
            min={0.01}
            step="any"
            {...register("configuration.advisoryCostLimitCents", { valueAsNumber: true })}
          />
        </label>
      </div>
    </>
  );
}
