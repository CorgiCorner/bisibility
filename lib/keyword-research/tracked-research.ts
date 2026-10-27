import { z } from "zod";
import { normalizeResearchKeyword } from "./request-key";

const metricRow = z.object({
  keyword: z.string(),
  searchVolume: z.number().int().nonnegative().nullable(),
  difficulty: z.number().finite().min(0).max(100).nullable(),
  cpcCents: z.number().finite().nonnegative().nullable(),
  intent: z
    .enum(["commercial", "informational", "navigational", "transactional", "unknown"])
    .nullable(),
  monthlyTrend: z.array(
    z.object({
      year: z.number().int(),
      month: z.number().int().min(1).max(12),
      searchVolume: z.number().int().nonnegative().nullable(),
    }),
  ),
});

export type TrackedResearchMetrics = {
  volume: number | null;
  difficulty: number | null;
  cpc: number | null;
  intent: "commercial" | "informational" | "navigational" | "transactional" | "unknown" | null;
  trend: Array<{ year: number; month: number; searchVolume: number | null }>;
  sourceSeed: string;
  fetchedAt: string;
};
type Target = { id: string; keyword: string; countryCode: string; languageCode: string };
type Snapshot = {
  countryCode: string;
  languageCode: string;
  seed: string;
  fetchedAt: Date;
  rows: unknown;
};
const key = (keyword: string, country: string, language: string) =>
  JSON.stringify([
    normalizeResearchKeyword(keyword),
    country.toUpperCase(),
    language.toLowerCase(),
  ]);

export function trackedResearchForTargets(
  targets: readonly Target[],
  snapshots: readonly Snapshot[],
) {
  const wanted = new Set(
    targets.map((target) => key(target.keyword, target.countryCode, target.languageCode)),
  );
  const latest = new Map<string, TrackedResearchMetrics>();
  for (const snapshot of [...snapshots].sort(
    (a, b) => b.fetchedAt.getTime() - a.fetchedAt.getTime(),
  )) {
    if (!Number.isFinite(snapshot.fetchedAt.getTime()) || !Array.isArray(snapshot.rows)) continue;
    for (const value of snapshot.rows) {
      const parsed = metricRow.safeParse(value);
      if (!parsed.success) continue;
      const row = parsed.data;
      const identity = key(row.keyword, snapshot.countryCode, snapshot.languageCode);
      if (!wanted.has(identity) || latest.has(identity)) continue;
      latest.set(identity, {
        volume: row.searchVolume,
        difficulty: row.difficulty,
        cpc: row.cpcCents === null ? null : row.cpcCents / 100,
        intent: row.intent,
        trend: row.monthlyTrend,
        sourceSeed: snapshot.seed,
        fetchedAt: snapshot.fetchedAt.toISOString(),
      });
    }
  }
  return new Map(
    targets.flatMap((target) => {
      const value = latest.get(key(target.keyword, target.countryCode, target.languageCode));
      return value ? [[target.id, value] as const] : [];
    }),
  );
}
