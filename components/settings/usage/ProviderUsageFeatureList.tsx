"use client";

import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import type { ProviderSpendConnection } from "@/lib/queries/provider-spend";
import type { ProviderUsageFeature, ProviderUsageStat } from "@/lib/settings/provider-usage-types";
import { metricEyebrowClassName } from "@/lib/ui/elevated-surface-styles";
import { useTranslations } from "next-intl";
import {
  featureSourceBuckets,
  featureUsageDisplay,
  formatCount,
  formatUsdCents,
} from "./provider-usage-view";

export function ProviderUsageFeatureList({
  connection,
}: Readonly<{ connection: ProviderSpendConnection }>) {
  const dateContext = useDateDisplay();
  const t = useTranslations("projectSettingsUsage.provider");

  function featureSources(stat: ProviderUsageStat) {
    return featureSourceBuckets(stat, {
      api: t("source.api"),
      app: t("source.app"),
      cli: t("source.cli"),
      mcp: t("source.mcp"),
      sdk: t("source.sdk"),
    });
  }

  function featureLabel(feature: ProviderUsageFeature) {
    switch (feature) {
      case "backlinks":
        return t("featureLabel.backlinks");
      case "domain_overview":
        return t("featureLabel.domainOverview");
      case "keyword_metrics":
        return t("featureLabel.keywordMetrics");
      case "keyword_research":
        return t("featureLabel.keywordResearch");
      case "rank_check":
        return t("featureLabel.rankCheck");
      case "ranked_keywords":
        return t("featureLabel.rankedKeywords");
    }
  }

  return (
    <div className="grid gap-4 border-t border-border bg-bg-sunken/40 px-3 py-3 sm:grid-cols-2">
      {connection.features.map((feature) => {
        const sources = featureSources(feature);
        const scheduled = sources.reduce((total, bucket) => total + bucket.scheduled, 0);
        const display = featureUsageDisplay(feature, connection.unit);
        const chips = [
          ...sources.map((bucket) => ({
            key: bucket.key,
            label: `${bucket.label} ${formatCount(bucket.count, dateContext.locale)}`,
          })),
          ...(scheduled > 0
            ? [{ key: "scheduled", label: t("scheduledChip", { count: scheduled }) }]
            : []),
          ...(display.unconfirmedCount > 0
            ? [
                {
                  key: "unconfirmed",
                  label: t("unconfirmedChip", { count: display.unconfirmedCount }),
                },
              ]
            : []),
          ...(feature.checksCount != null
            ? [{ key: "checks", label: t("checksChip", { count: feature.checksCount }) }]
            : []),
        ];
        return (
          <div key={feature.feature}>
            <span className={metricEyebrowClassName}>{featureLabel(feature.feature)}</span>
            <p className="m-0 mt-1 text-[13px] font-semibold text-fg tabular-nums">
              {display.kind === "usd"
                ? t("feature", {
                    amount: formatUsdCents(display.usdCents, dateContext.locale),
                    count: display.requestCount,
                  })
                : display.kind === "native"
                  ? t("featureSearches", {
                      count: display.requestCount,
                      searches: display.quantity,
                    })
                  : t("featureCount", { count: display.requestCount })}
            </p>
            {chips.length ? (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {chips.map((chip) => (
                  <span
                    className="rounded-full border border-border bg-bg-sunken px-2 py-0.5 font-sans tabular-nums text-[9px] font-semibold uppercase text-fg-muted"
                    key={chip.key}
                  >
                    {chip.label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
