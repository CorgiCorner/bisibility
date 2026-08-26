import { Prisma } from "@/lib/generated/prisma/client";

const rawMetric = Prisma.sql`COALESCE((
  SELECT rc.raw FROM "rank_checks" rc
  WHERE rc."keywordId" = k.id AND rc.raw IS NOT NULL
  ORDER BY rc."checkedAt" DESC, rc.id DESC LIMIT 1
), '{}'::jsonb)`;

function numeric(paths: string[]) {
  return Prisma.sql`COALESCE(${Prisma.join(paths.map((path) => Prisma.sql`NULLIF(${rawMetric}#>>${path}::text[], '')::numeric`))})`;
}

export const volumeExpression = numeric([
  "{volume}",
  "{searchVolume}",
  "{search_volume}",
  "{keyword_info,search_volume}",
  "{keywordInfo,searchVolume}",
  "{metrics,volume}",
  "{metrics,searchVolume}",
]);
export const difficultyExpression = Prisma.sql`LEAST(100, GREATEST(0, ROUND(CASE
  WHEN (${numeric(["{difficulty}", "{keywordDifficulty}", "{keyword_difficulty}", "{keyword_info,keyword_difficulty}", "{keywordInfo,keywordDifficulty}", "{metrics,difficulty}"])}) > 0
    AND (${numeric(["{difficulty}", "{keywordDifficulty}", "{keyword_difficulty}", "{keyword_info,keyword_difficulty}", "{keywordInfo,keywordDifficulty}", "{metrics,difficulty}"])}) <= 1
  THEN (${numeric(["{difficulty}", "{keywordDifficulty}", "{keyword_difficulty}", "{keyword_info,keyword_difficulty}", "{keywordInfo,keywordDifficulty}", "{metrics,difficulty}"])}) * 100
  ELSE (${numeric(["{difficulty}", "{keywordDifficulty}", "{keyword_difficulty}", "{keyword_info,keyword_difficulty}", "{keywordInfo,keywordDifficulty}", "{metrics,difficulty}"])}) END)))`;

export const serpFeaturesExpression = Prisma.sql`ARRAY(SELECT DISTINCT feature FROM (
  SELECT CASE
    WHEN key ~ 'featured|answer_box' THEN 'featured'
    WHEN key ~ 'people|related_question' THEN 'paa'
    WHEN key ~ 'sitelink' THEN 'sitelinks'
    WHEN key ~ 'image' THEN 'image'
    WHEN key ~ 'video' THEN 'video'
    WHEN key ~ '(^|_)ai(_|$)|ai_overview' THEN 'ai'
  END AS feature
  FROM "rank_checks" rc
  CROSS JOIN LATERAL jsonb_path_query(rc.raw, '$.** ? (@.type() == "string")') value
  CROSS JOIN LATERAL (SELECT lower(regexp_replace(trim(both '"' from value::text), '[^a-z0-9]+', '_', 'g')) key) normalized
  WHERE rc."keywordId" = k.id AND rc.raw IS NOT NULL
  ORDER BY rc."checkedAt" DESC LIMIT 600
) features WHERE feature IS NOT NULL)`;

export const latestTrafficExpression = Prisma.sql`(
  SELECT jsonb_build_object('clicks', ts.clicks, 'impressions', ts.impressions, 'ctr', ts.ctr)
  FROM "keyword_traffic_snapshots" ts
  LEFT JOIN "provider_connections" pc ON pc."projectId" = k."projectId"
    AND pc.provider = ts.provider AND pc.kind = 'analytics' AND pc.enabled AND pc.status = 'connected'
  WHERE ts."keywordId" = k.id AND ts.date >= (
    SELECT MAX(project_ts.date) - INTERVAL '7 days' FROM "keyword_traffic_snapshots" project_ts
    JOIN "keywords" project_keyword ON project_keyword.id = project_ts."keywordId"
    WHERE project_keyword."projectId" = k."projectId"
  ) ORDER BY ts.date DESC, COALESCE(pc.priority, 10000), ts.provider ASC LIMIT 1
)`;
