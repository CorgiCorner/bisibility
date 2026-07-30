export type SavedKeywordTrendPoint = {
  month: number;
  searchVolume: number | null;
  year: number;
};

export type SavedKeywordRow = {
  cpc: number | null;
  difficulty: number | null;
  intent: string | null;
  location: string;
  publicId: string;
  savedAt: string;
  sourceSeed: string | null;
  text: string;
  trend: SavedKeywordTrendPoint[];
  variantCount: number;
  volume: number | null;
};

function isTrendPoint(value: unknown): value is SavedKeywordTrendPoint {
  if (!value || typeof value !== "object") return false;
  const point = value as Partial<SavedKeywordTrendPoint>;
  return (
    Number.isInteger(point.month) &&
    Number.isInteger(point.year) &&
    (point.searchVolume === null || Number.isInteger(point.searchVolume))
  );
}

export function savedKeywordTrend(value: unknown): SavedKeywordTrendPoint[] {
  return Array.isArray(value) ? value.filter(isTrendPoint) : [];
}
