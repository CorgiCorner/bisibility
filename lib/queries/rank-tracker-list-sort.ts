import { Prisma } from "@/lib/generated/prisma/client";
import type {
  RankTrackerQueryState,
  RankTrackerSortField,
} from "@/lib/keywords/rank-tracker-query-types";

const expressions: Record<RankTrackerSortField, Prisma.Sql> = {
  keyword: Prisma.sql`lower(k.text)`,
  device: Prisma.sql`k.device::text`,
  position: Prisma.sql`d.position`,
  change: Prisma.sql`d."positionBaseline" - d.position`,
  volume: Prisma.sql`d.volume`,
  difficulty: Prisma.sql`d.difficulty`,
  sparkline: Prisma.sql`d.position`,
  clicks: Prisma.sql`(d.traffic->>'clicks')::int`,
  impressions: Prisma.sql`(d.traffic->>'impressions')::int`,
  ctr: Prisma.sql`(d.traffic->>'ctr')::float`,
  lastChecked: Prisma.sql`d."lastCheckAt"`,
  frequency: Prisma.sql`COALESCE(ks.frequency::text, pd.frequency::text, 'manual')`,
  location: Prisma.sql`lower(l."displayName")`,
  targetRanking: Prisma.sql`lower(concat_ws(' ', k."targetUrl", d."rankingUrl"))`,
  tags: Prisma.sql`array_to_string(d.tags, ' ')`,
  topic: Prisma.sql`lower(k.topic)`,
  intent: Prisma.sql`lower(k.intent)`,
};

export function rankTrackerOrderBy(sort: RankTrackerQueryState["sort"]) {
  const direction = sort.direction === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  const nulls = sort.direction === "asc" ? Prisma.sql`NULLS FIRST` : Prisma.sql`NULLS LAST`;
  return Prisma.sql`${expressions[sort.field]} ${direction} ${nulls}, k."createdAt" DESC, k.id DESC`;
}
