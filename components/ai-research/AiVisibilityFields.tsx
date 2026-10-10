"use client";
import { MenuSelect } from "@/components/ui/MenuSelect";
import type { AiResearchCatalog } from "@/lib/ai-research/catalog-types";
import type { promptSchema, visibilitySchema } from "@/lib/ai-research/schema";
import { useTranslations } from "next-intl";
import { Controller, type UseFormReturn } from "react-hook-form";
import type { z } from "zod";
import { legacyVisibilityMarket } from "./ai-research-presets";

export type AiResearchForm = UseFormReturn<
  z.input<typeof visibilitySchema | typeof promptSchema>,
  unknown,
  z.output<typeof visibilitySchema | typeof promptSchema>
>;
export function AiVisibilityFields({
  form,
  catalog,
  disabled,
}: Readonly<{ form: AiResearchForm; catalog?: AiResearchCatalog; disabled: boolean }>) {
  const t = useTranslations("projectAiResearch");
  const values = form.watch();
  const platform = "platform" in values ? values.platform : "chat_gpt";
  const availableMarkets = [
    legacyVisibilityMarket,
    ...(catalog?.visibilityMarkets ?? []).filter(
      (market) => market.platform !== "chat_gpt" || market.locationCode !== 2840,
    ),
  ];
  const markets = availableMarkets.filter((market) => market.platform === platform);
  const current = markets.find(
    (market) =>
      market.locationCode === ("location_code" in values ? values.location_code : undefined),
  );
  function choosePlatform(next: string) {
    form.setValue("platform", next as "chat_gpt" | "google");
    const market = availableMarkets.find((item) => item.platform === next);
    if (market) {
      form.setValue("location_code", market.locationCode);
      form.setValue("language_code", market.languages[0]?.code ?? "en");
    }
  }
  return (
    <>
      <Controller
        name="platform"
        control={form.control}
        render={({ field }) => (
          <div className="grid gap-2 text-ui-body">
            <span>{t("platform")}</span>
            <MenuSelect
              ariaLabel={t("platform")}
              size="input"
              disabled={disabled}
              value={field.value ?? "chat_gpt"}
              onChange={choosePlatform}
              options={[
                {
                  label: "ChatGPT",
                  value: "chat_gpt",
                  disabled: false,
                },
                {
                  label: "Google AI Overview",
                  value: "google",
                  disabled: !catalog?.visibilityMarkets.some(
                    (market) => market.platform === "google",
                  ),
                },
              ]}
            />
          </div>
        )}
      />
      <Controller
        name="target_type"
        control={form.control}
        render={({ field }) => (
          <div className="grid gap-2 text-ui-body">
            <span>{t("searchFor")}</span>
            <MenuSelect
              ariaLabel={t("searchFor")}
              size="input"
              disabled={disabled}
              value={field.value ?? "domain"}
              onChange={field.onChange}
              options={[
                { label: t("domainCitations"), value: "domain" },
                { label: t("brandMentions"), value: "brand" },
              ]}
            />
          </div>
        )}
      />
      <Controller
        name="location_code"
        control={form.control}
        render={({ field }) => (
          <div className="grid gap-2 text-ui-body">
            <span>{t("country")}</span>
            <MenuSelect
              ariaLabel={t("country")}
              size="input"
              searchable
              disabled={disabled || !markets.length}
              value={String(field.value ?? "")}
              onChange={(next) => {
                field.onChange(Number(next));
                const market = markets.find((item) => item.locationCode === Number(next));
                form.setValue("language_code", market?.languages[0]?.code ?? "en");
              }}
              options={markets.map((market) => ({
                label: market.countryName,
                value: String(market.locationCode),
              }))}
            />
          </div>
        )}
      />
      <Controller
        name="language_code"
        control={form.control}
        render={({ field }) => (
          <div className="grid gap-2 text-ui-body">
            <span>{t("language")}</span>
            <MenuSelect
              ariaLabel={t("language")}
              size="input"
              searchable
              disabled={disabled || !current?.languages.length}
              value={field.value ?? "en"}
              onChange={field.onChange}
              options={(current?.languages ?? []).map((language) => ({
                label: language.name,
                value: language.code,
                searchText: language.code,
              }))}
            />
          </div>
        )}
      />
      <p className="m-0 text-ui-xs text-fg-muted sm:col-span-2">
        {catalog ? t("marketCoverageHint") : t("legacyVisibilityPreset")}
      </p>
    </>
  );
}
