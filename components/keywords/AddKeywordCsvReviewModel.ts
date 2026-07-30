import type { DrawerCsvKeywordRow } from "@/components/keywords/add/AddKeywordCsvRows";
import type { AddKeywordsRowInput } from "@/lib/schemas/keyword";
import type { SerpDevice } from "@/lib/serp/markets";

export type ExistingKeyword = {
  device: SerpDevice;
  keyword: string;
  locationKey: string;
};

export type CsvKeywordReviewItem = {
  alreadyTracked: boolean;
  device: SerpDevice;
  issues: DrawerCsvKeywordRow["issues"];
  key: string;
  keyword: string;
  locationLabel: string;
  position: number;
  row: number;
  tags: string[];
  targetUrl?: string | null;
};

type ExistingKeywordRow = {
  device: string;
  keyword: string;
  location: { canonicalKey: string };
};

function normalizeKeyword(value: string) {
  return value.trim().toLowerCase();
}

function rowDevice(value: string): SerpDevice {
  return value.toLowerCase() === "mobile" ? "mobile" : "desktop";
}

function trackingKey(keyword: string, device: string, locationKey: string) {
  return [normalizeKeyword(keyword), device, locationKey].join("\u0000");
}

function existingTrackingKeys(existingKeywords: readonly ExistingKeyword[]) {
  return new Set(
    existingKeywords.map((item) => trackingKey(item.keyword, item.device, item.locationKey)),
  );
}

export function existingKeywordsFromRows(rows: readonly ExistingKeywordRow[]): ExistingKeyword[] {
  return rows.map((row) => ({
    device: rowDevice(row.device),
    keyword: row.keyword,
    locationKey: row.location.canonicalKey,
  }));
}

export function buildCsvKeywordReview(
  rows: readonly DrawerCsvKeywordRow[],
  existingKeywords: readonly ExistingKeyword[],
): CsvKeywordReviewItem[] {
  const existing = existingTrackingKeys(existingKeywords);
  const occurrences = new Map<string, number>();

  return rows.map((row, index) => {
    const key = trackingKey(row.keyword, row.device, row.trackingLocationKey);
    const occurrence = occurrences.get(key) ?? 0;
    occurrences.set(key, occurrence + 1);
    return {
      alreadyTracked: existing.has(key),
      device: row.device,
      issues: row.issues,
      key: `${key}:${occurrence}`,
      keyword: row.keyword,
      locationLabel: row.locationLabel,
      position: index + 1,
      row: row.row,
      tags: row.tags,
      targetUrl: row.targetUrl,
    };
  });
}

export function newCsvKeywordRows(
  rows: readonly DrawerCsvKeywordRow[],
  existingKeywords: readonly ExistingKeyword[],
): AddKeywordsRowInput[] {
  const existing = existingTrackingKeys(existingKeywords);
  return rows
    .filter(
      (row) =>
        row.issues.length === 0 &&
        !existing.has(trackingKey(row.keyword, row.device, row.trackingLocationKey)),
    )
    .map(
      ({ issues: _issues, locationLabel: _label, row: _row, trackingLocationKey: _key, ...row }) =>
        row,
    );
}
