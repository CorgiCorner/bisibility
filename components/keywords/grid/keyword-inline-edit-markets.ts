import type { MarketComboboxOption } from "@/components/markets/MarketCombobox";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import type { useTranslations } from "next-intl";

export function drawerMarketOptions(
  markets: ProjectMarketsView["markets"],
  selectedKey: string,
  keyword: KeywordRow,
  t: ReturnType<typeof useTranslations<"projectRankTracker.keywordImport.management.grid">>,
): MarketComboboxOption<string>[] {
  const inRegistry = markets.some((m) => m.canonicalKey === selectedKey);
  const legacy: MarketComboboxOption<string>[] = inRegistry
    ? []
    : [
        {
          countryCode: keyword.location.countryCode,
          disabled: true,
          languageCode: keyword.location.hl,
          languageLabel: keyword.location.languageLabel ?? "",
          locationLabel: keyword.locationName,
          payload: selectedKey,
          secondary: t("inlineLegacyMarket"),
          tooltip: t("inlineLegacyMarketDetail"),
          value: selectedKey,
        },
      ];
  return [
    ...legacy,
    ...markets.map((m) => ({
      countryCode: m.countryCode,
      disabled: false,
      languageCode: m.languageCode,
      languageLabel: m.languageLabel,
      locationLabel: m.displayName,
      payload: m.canonicalKey,
      secondary: m.status !== "active" ? t("inlinePausedMarket") : undefined,
      tooltip: m.status !== "active" ? t("inlinePausedMarketDetail") : undefined,
      value: m.canonicalKey,
    })),
  ];
}
