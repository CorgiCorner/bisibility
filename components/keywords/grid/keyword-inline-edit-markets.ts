import type { MarketComboboxOption } from "@/components/markets/MarketCombobox";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";

export function drawerMarketOptions(
  markets: ProjectMarketsView["markets"],
  selectedKey: string,
  keyword: KeywordRow,
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
          secondary: "no longer in registry",
          tooltip: "This market is no longer available in the project registry.",
          value: selectedKey,
        },
      ];
  return [
    ...legacy,
    ...markets.map((m) => ({
      countryCode: m.countryCode,
      disabled: m.status !== "active",
      languageCode: m.languageCode,
      languageLabel: m.languageLabel,
      locationLabel: m.displayName,
      payload: m.canonicalKey,
      secondary: m.status !== "active" ? "paused" : undefined,
      tooltip:
        m.status !== "active" ? "Enable this market in Settings before selecting it." : undefined,
      value: m.canonicalKey,
    })),
  ];
}
