import { regionDisplayName } from "@/lib/i18n/display-names";
import type { ComparisonRun } from "@/lib/provider-comparison/types";
export type SearchScope = Pick<ComparisonRun, "keyword" | "search">;
export function searchLocationLabel(run: SearchScope, locale: string) {
  const search = run.search;
  if (!search || search.locationKind === "country")
    return regionDisplayName(search?.countryCode, run.keyword.locationLabel, locale);
  const parts = search.locationKey.split("@")[0].split("/");
  const place = parts.at(-1) || run.keyword.locationLabel.split(",")[0].trim();
  try {
    return `${place}, ${new Intl.DisplayNames([locale], { type: "region" }).of(search.countryCode) || search.countryCode}`;
  } catch {
    return place;
  }
}
export function searchScopeKeyword(run: SearchScope, locale: string) {
  return {
    device: run.keyword.device,
    engine: "Google",
    location: {
      countryCode: run.search?.countryCode ?? "",
      displayName: searchLocationLabel(run, locale),
      hl: run.search?.language ?? "",
      languageLabel: run.search?.language,
    },
  };
}
