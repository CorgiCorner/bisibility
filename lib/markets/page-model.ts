export type MarketStatus = "active" | "paused" | "removed";

export type MarketsPageRow = {
  activeKeywordCount: number;
  canonicalKey: string;
  countryCode: string;
  currentVisibility: number | null;
  displayName: string;
  futureKeywordDevices: ("desktop" | "mobile")[];
  id: string;
  keywordCount: number;
  languageLabel: string;
  locationId: string;
  monthlyCostCents: number | null;
  name: string;
  status: MarketStatus;
  topThreeCount: number | null;
};

export type MarketsSortKey = "currentVisibility" | "keywordCount" | "monthlyCostCents" | "name";

type VisibleGroups = {
  active: MarketsPageRow[];
  paused: MarketsPageRow[];
};

function compareValue(left: number | string | null, right: number | string | null) {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return typeof left === "string" && typeof right === "string"
    ? left.localeCompare(right, "en", { sensitivity: "base" })
    : Number(left) - Number(right);
}

export function sortMarkets(
  rows: readonly MarketsPageRow[],
  key: MarketsSortKey = "name",
): MarketsPageRow[] {
  return [...rows].sort((left, right) => {
    const compared = compareValue(left[key], right[key]);
    return compared || left.id.localeCompare(right.id, "en");
  });
}

export function groupMarkets(rows: readonly MarketsPageRow[]): VisibleGroups {
  return {
    active: rows.filter((row) => row.status === "active"),
    paused: rows.filter((row) => row.status === "paused"),
  };
}

export function marketMetric(value: number | null) {
  return value == null ? "-" : value.toLocaleString("en-US");
}
