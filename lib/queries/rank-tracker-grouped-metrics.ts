import { Prisma } from "@/lib/generated/prisma/client";

export const groupedDifficultyPaths = [
  "{difficulty}",
  "{keywordDifficulty}",
  "{keyword_difficulty}",
  "{keyword_info,keyword_difficulty}",
  "{keywordInfo,keywordDifficulty}",
  "{metrics,difficulty}",
];

export function groupedMetricNumber(raw: Prisma.Sql, paths: readonly string[]) {
  return Prisma.sql`COALESCE(${Prisma.join(
    paths.map((path) => Prisma.sql`NULLIF(${raw}#>>${path}::text[], '')::numeric`),
  )})`;
}

export function groupedDifficultyExpression(rawDifficulty: Prisma.Sql) {
  return Prisma.sql`CASE
  WHEN (${rawDifficulty}) IS NULL THEN NULL
  ELSE LEAST(100, GREATEST(0, ROUND(CASE
    WHEN (${rawDifficulty}) > 0 AND (${rawDifficulty}) <= 1 THEN (${rawDifficulty}) * 100
    ELSE (${rawDifficulty})
  END)))
END`;
}
