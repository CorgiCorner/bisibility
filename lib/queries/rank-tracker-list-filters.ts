import { Prisma } from "@/lib/generated/prisma/client";
import type { KeywordFilters } from "@/lib/keywords/keyword-filter-model";
import type { ActiveLens } from "@/lib/keywords/lens-model";

const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");
const positionRanges = {
  top3: Prisma.sql`d.position <= 3`,
  top10: Prisma.sql`d.position <= 10`,
  "11-50": Prisma.sql`d.position > 10 AND d.position <= 50`,
  "51-100": Prisma.sql`d.position > 50 AND d.position <= 100`,
} as const;
const changePredicates = {
  any: Prisma.sql`true`,
  up: Prisma.sql`d."positionBaseline" IS NOT NULL AND d."positionBaseline" > d.position`,
  down: Prisma.sql`d."positionBaseline" IS NOT NULL AND d."positionBaseline" < d.position`,
  new: Prisma.sql`(d."positionBaseline" IS NULL OR d."positionBaseline" > 100) AND d.position <= 100`,
  lost: Prisma.sql`d."positionBaseline" <= 100 AND d.position > 100`,
} as const;

function listOrTrue<T extends string>(values: T[], expression: (value: T) => Prisma.Sql) {
  return values.length
    ? Prisma.sql`(${Prisma.join(values.map(expression), " OR ")})`
    : Prisma.sql`true`;
}

export function lensPredicate(lens: ActiveLens) {
  return Prisma.sql`${lens.device === "all" ? Prisma.sql`true` : Prisma.sql`k.device::text = ${lens.device}`}
    AND ${lens.locationId ? Prisma.sql`(NOT EXISTS (SELECT 1 FROM "keywords" known JOIN "locations" known_location ON known_location.id = known."locationId" WHERE known."projectId" = k."projectId" AND known_location."canonicalKey" = ${lens.locationId}) OR l."canonicalKey" = ${lens.locationId})` : Prisma.sql`true`}`;
}

export function contentPredicate(
  filters: KeywordFilters,
  search: string,
  options: { deferExactRowPredicates?: boolean } = {},
) {
  const contains = escapeLike(filters.contains.trim());
  const query = options.deferExactRowPredicates ? "" : escapeLike(search.trim());
  const position = listOrTrue(filters.position, (bucket) => positionRanges[bucket]);
  const searchFields = Prisma.sql`concat_ws(' ', k.text, k."publicId", d."rankingUrl", k."targetUrl", array_to_string(d.tags, ' '), k.topic, k.intent)`;
  return Prisma.sql`
    ${position} AND ${options.deferExactRowPredicates ? Prisma.sql`true` : changePredicates[filters.change]}
    AND ${options.deferExactRowPredicates ? Prisma.sql`true` : Prisma.sql`COALESCE(d.volume, 0) >= ${filters.volMin * 1000}`}
    AND ${options.deferExactRowPredicates || filters.volMax >= 50 ? Prisma.sql`true` : Prisma.sql`COALESCE(d.volume, 0) <= ${filters.volMax * 1000}`}
    AND ${contains ? Prisma.sql`k.text ILIKE ${`%${contains}%`} ESCAPE '\\'` : Prisma.sql`true`}
    AND ${filters.tags.length ? Prisma.sql`d.tags @> ARRAY[${Prisma.join(filters.tags)}]::text[]` : Prisma.sql`true`}
    AND ${filters.topics.length ? Prisma.sql`k.topic IN (${Prisma.join(filters.topics)})` : Prisma.sql`true`}
    AND ${filters.intents.length ? Prisma.sql`k.intent IN (${Prisma.join(filters.intents)})` : Prisma.sql`true`}
    AND ${!options.deferExactRowPredicates && filters.serp.length ? Prisma.sql`d."serpFeatures" @> ARRAY[${Prisma.join(filters.serp)}]::text[]` : Prisma.sql`true`}
    AND ${lastCheckPredicate(filters.lastCheck)}
    AND true
    AND ${!options.deferExactRowPredicates && filters.urlChanged ? Prisma.sql`d."rankingPages" > 1` : Prisma.sql`true`}
    AND ${query ? Prisma.sql`${searchFields} ILIKE ${`%${query}%`} ESCAPE '\\'` : Prisma.sql`true`}`;
}

function lastCheckPredicate(value: KeywordFilters["lastCheck"]) {
  if (value === "any") return Prisma.sql`true`;
  if (value === "not_checked") return Prisma.sql`d."latestAttemptId" IS NULL`;
  return Prisma.sql`d."lastCheckStatus" = ${value}`;
}
