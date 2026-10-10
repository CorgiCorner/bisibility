"use client";
import { MenuSelect } from "@/components/ui/MenuSelect";
import type { trackingConfigurationForm } from "@/lib/ai-tracking/projections/forms";
import { serpCountryCatalog } from "@/lib/serp/country-catalog";
import { serpLanguageCatalog } from "@/lib/serp/generated/serp-language-catalog";
import { useTranslations } from "next-intl";
import { type Control, Controller } from "react-hook-form";
import type { z } from "zod";
export function TrackingMarketControls({
  control,
  onChange,
}: Readonly<{
  control: Control<z.infer<typeof trackingConfigurationForm>>;
  onChange: () => void;
}>) {
  const t = useTranslations("projectAiTracking");
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <p className="mb-2 text-sm">{t("languageCode")}</p>
        <Controller
          name="locale"
          control={control}
          render={({ field }) => (
            <MenuSelect
              ariaLabel={t("languageCode")}
              searchable
              size="input"
              value={field.value}
              onChange={(value) => {
                field.onChange(value);
                onChange();
              }}
              options={serpLanguageCatalog.map((language) => ({
                value: language.code,
                label: language.label,
              }))}
            />
          )}
        />
      </div>
      <div>
        <p className="mb-2 text-sm">{t("location")}</p>
        <Controller
          name="location"
          control={control}
          render={({ field }) => (
            <MenuSelect
              ariaLabel={t("location")}
              searchable
              size="input"
              value={field.value}
              onChange={(value) => {
                field.onChange(value);
                onChange();
              }}
              options={serpCountryCatalog.map((country) => ({
                value: country.displayName,
                label: country.displayName,
              }))}
            />
          )}
        />
      </div>
    </div>
  );
}
