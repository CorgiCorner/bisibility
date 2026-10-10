"use client";
import { MenuSelect } from "@/components/ui/MenuSelect";
import type { AiCatalogOutcome } from "@/lib/ai-research/catalog-types";
import type { trackingConfigurationForm } from "@/lib/ai-tracking/projections/forms";
import { useTranslations } from "next-intl";
import { type Control, Controller } from "react-hook-form";
import type { z } from "zod";
import { TrackingMarketControls } from "./TrackingMarketControls";
import { TrackingModelControl } from "./TrackingModelControl";

export function TrackingSourceControls({
  control,
  source,
  engines,
  onInvalidate,
  onCatalog,
}: Readonly<{
  control: Control<z.infer<typeof trackingConfigurationForm>>;
  source: string;
  engines: string[];
  onInvalidate: () => void;
  onCatalog?: () => Promise<AiCatalogOutcome>;
}>) {
  const t = useTranslations("projectAiTracking");
  return (
    <>
      <div className="text-sm">
        <p className="mb-2 font-medium">{t("source")}</p>
        <Controller
          name="source"
          control={control}
          render={({ field }) => (
            <MenuSelect
              ariaLabel={t("source")}
              size="input"
              value={field.value}
              onChange={(value) => {
                field.onChange(value);
                onInvalidate();
              }}
              options={[
                { value: "consumer_scrape", label: t("consumerScraper") },
                { value: "model_api", label: t("modelAPI") },
                { value: "google_aio", label: t("googleAIOverview") },
              ]}
            />
          )}
        />
      </div>
      <div className="text-sm">
        <p className="mb-2 font-medium">{t("engine")}</p>
        <Controller
          name="engine"
          control={control}
          render={({ field }) => (
            <MenuSelect
              ariaLabel={t("engine")}
              size="input"
              value={engines.includes(field.value) ? field.value : engines[0]}
              onChange={(value) => {
                field.onChange(value);
                onInvalidate();
              }}
              options={engines.map((engine) => ({
                value: engine,
                label: engine.replaceAll("_", " "),
              }))}
            />
          )}
        />
      </div>
      {source === "model_api" ? (
        <Controller
          name="model"
          control={control}
          render={({ field }) => (
            <TrackingModelControl
              value={field.value}
              onChange={(value) => {
                field.onChange(value);
                onInvalidate();
              }}
              onCatalog={onCatalog}
            />
          )}
        />
      ) : (
        <TrackingMarketControls control={control} onChange={onInvalidate} />
      )}
    </>
  );
}
