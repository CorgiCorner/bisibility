export type RatingPoint = { day: string; rating: number | null };

export function buildRatingSeries(
  rows: readonly RatingPoint[],
  today: string,
  days: number,
): RatingPoint[] {
  if (!rows.length) return [];
  const end = new Date(`${today}T00:00:00Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days + 1);
  const firstDay = rows[0].day;
  const values = new Map(rows.map((row) => [row.day, row.rating]));
  const result: RatingPoint[] = [];
  for (
    let time = Math.max(start.getTime(), Date.parse(`${firstDay}T00:00:00Z`));
    time <= end.getTime();
    time += 86_400_000
  ) {
    const day = new Date(time).toISOString().slice(0, 10);
    result.push({ day, rating: values.get(day) ?? null });
  }
  return result;
}

export type DomainRatingView = {
  projectId: string;
  domain: string | null;
  enabled: boolean;
  source: "own" | "hosted" | null;
  hasOwnConnection: boolean;
  points: RatingPoint[];
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
};
