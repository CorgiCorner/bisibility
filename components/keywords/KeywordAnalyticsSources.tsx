"use client";

import { useTranslations } from "next-intl";
import { AnalyticsProviderBadge, analyticsProviderName } from "./AnalyticsProviderBadge";

const sources = ["gsc", "ga4", "plausible"];
export function KeywordAnalyticsSources({
  connectedProviders,
}: Readonly<{ connectedProviders: readonly string[] }>) {
  const t = useTranslations("projectRankTracker.keywordDetail.traffic.sync");
  return (
    <ul aria-label={t("sources")} className="mb-0 mt-3 flex list-none flex-wrap gap-3 p-0">
      {sources.map((source) => {
        const active = connectedProviders.includes(source);
        return (
          <li
            key={source}
            aria-label={`${analyticsProviderName(source)}, ${t(active ? "sourceActive" : "sourceInactive")}`}
            className="min-w-0 max-w-full"
          >
            <AnalyticsProviderBadge provider={source} connected={active} />
          </li>
        );
      })}
    </ul>
  );
}
