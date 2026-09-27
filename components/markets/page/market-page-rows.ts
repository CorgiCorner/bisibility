import type { MarketsPageRow } from "@/lib/markets/page-model";
import type { ArchivedProjectMarketsView, ProjectMarketsView } from "@/lib/queries/project-markets";

export function normalRow(market: ProjectMarketsView["markets"][number]): MarketsPageRow {
  return {
    activeKeywordCount: market.activeKeywordCount ?? 0,
    canonicalKey: market.canonicalKey,
    countryCode: market.countryCode,
    currentVisibility: market.currentVisibility ?? null,
    displayName: market.displayName,
    futureKeywordDevices: market.futureKeywordDevices ?? ["desktop", "mobile"],
    id: market.id,
    keywordCount: market.keywordCount ?? 0,
    languageLabel: market.languageLabel,
    locationId: market.locationId ?? "",
    monthlyCostCents: market.monthlyCostCents,
    name: market.name ?? market.displayName,
    status: market.status,
    topThreeCount: market.topThreeCount ?? null,
  };
}

export function archivedRow(market: ArchivedProjectMarketsView["markets"][number]): MarketsPageRow {
  return {
    activeKeywordCount: market.keywordCount,
    canonicalKey: "",
    countryCode: "",
    currentVisibility: null,
    displayName: market.displayName,
    futureKeywordDevices: market.futureKeywordDevices ?? ["desktop", "mobile"],
    id: market.id,
    keywordCount: market.keywordCount,
    languageLabel: market.languageLabel,
    locationId: market.locationId ?? "",
    monthlyCostCents: market.monthlyCostCents ?? null,
    name: market.name ?? market.displayName,
    status: "removed",
    topThreeCount: null,
  };
}
