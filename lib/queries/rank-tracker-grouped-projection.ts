import { Prisma } from "@/lib/generated/prisma/client";
import {
  groupedDifficultyExpression,
  groupedDifficultyPaths,
  groupedMetricNumber,
} from "./rank-tracker-grouped-metrics";

const groupedVolumePaths = [
  "{volume}",
  "{searchVolume}",
  "{search_volume}",
  "{keyword_info,search_volume}",
  "{keywordInfo,searchVolume}",
  "{metrics,volume}",
  "{metrics,searchVolume}",
];

export type GroupedMetricRequirements = { difficulty: boolean; volume: boolean };

export function groupedMetricProjection(
  metricRaw: Prisma.Sql,
  requirements: GroupedMetricRequirements,
) {
  const volume = requirements.volume
    ? Prisma.sql`(SELECT ${groupedMetricNumber(metricRaw, groupedVolumePaths)} AS value) volume_input`
    : Prisma.empty;
  const difficulty = requirements.difficulty
    ? Prisma.sql`(SELECT ${groupedMetricNumber(metricRaw, groupedDifficultyPaths)} AS value) difficulty_input`
    : Prisma.empty;
  const source = requirements.volume ? volume : difficulty;
  const join =
    requirements.volume && requirements.difficulty
      ? Prisma.sql` CROSS JOIN ${difficulty}`
      : Prisma.empty;
  const columns: Prisma.Sql[] = [];
  if (requirements.volume) columns.push(Prisma.sql`volume_input.value AS volume`);
  if (requirements.difficulty) {
    columns.push(
      Prisma.sql`${groupedDifficultyExpression(Prisma.sql`difficulty_input.value`)} AS "groupedDifficulty"`,
    );
  }

  return Prisma.sql`
    SELECT ${Prisma.join(columns, ", ")}
    FROM ${source}${join}`;
}
