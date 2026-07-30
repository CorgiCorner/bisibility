export type TrafficMetrics = {
  rowsFetched: number;
  rowsMatched: number;
  rowsUpserted: number;
};

export function trafficMetrics(meta: unknown): TrafficMetrics {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return { rowsFetched: 0, rowsMatched: 0, rowsUpserted: 0 };
  }
  const record = meta as Record<string, unknown>;
  const number = (key: keyof TrafficMetrics) => {
    const value = record[key];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  };
  return {
    rowsFetched: number("rowsFetched"),
    rowsMatched: number("rowsMatched"),
    rowsUpserted: number("rowsUpserted"),
  };
}
