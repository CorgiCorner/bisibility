import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { SavedKeywordRow } from "@/lib/saved-keywords/model";
import {
  listSavedKeywordRows,
  removeSavedKeywordRows,
  saveSavedKeywordRows,
} from "@/lib/saved-keywords/service";
import { canonicalKeySchema, intentSchema, KEYWORD_TEXT_MAX } from "@/lib/schemas/keyword";
import { keywordMarketSelect, projectDefaultSerpMarket } from "@/lib/serp/default-market";
import { z } from "zod";
import type { ApiContext } from "./context";
import { paginateArray } from "./pagination";
import { listResponse, resourceResponse } from "./responses";
import {
  objectBody,
  parseApiInput,
  readJsonBody,
  runDomain,
  scopedProject,
  snakeizeKeys,
} from "./surface";

const keywordTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(KEYWORD_TEXT_MAX)
  .transform((value) => value.replace(/\s+/g, " "));

const savedKeywordItemSchema = z.union([
  keywordTextSchema,
  z.object({
    cpcCents: z.number().int().nonnegative().nullable().optional(),
    difficulty: z.number().int().min(0).max(100).nullable().optional(),
    intent: intentSchema,
    keyword: keywordTextSchema,
    location: canonicalKeySchema.optional(),
    searchVolume: z.number().int().nonnegative().nullable().optional(),
    sourceSeed: keywordTextSchema.nullable().optional(),
    variantCount: z.number().int().nonnegative().optional(),
  }),
]);

const createSavedKeywordsSchema = z.object({
  keywords: z.array(savedKeywordItemSchema).min(1).max(500),
});

type SavedKeywordItem = z.infer<typeof savedKeywordItemSchema>;

/**
 * The extension saves bare strings; the research surface sends metric
 * snapshots. Both land on the same row shape, with the project's default
 * market filling in an absent location.
 */
function savedKeywordRow(item: SavedKeywordItem, defaultLocation: string) {
  if (typeof item === "string") {
    return { keyword: item, location: defaultLocation, variantCount: 0 };
  }
  return {
    cpcCents: item.cpcCents ?? null,
    difficulty: item.difficulty ?? null,
    intent: item.intent ?? null,
    keyword: item.keyword,
    location: item.location ?? defaultLocation,
    searchVolume: item.searchVolume ?? null,
    sourceSeed: item.sourceSeed ?? null,
    variantCount: item.variantCount ?? 0,
  };
}

/** Public IDs are exposed as `id`; internal pair columns stay behind the REST boundary. */
function savedKeywordApiResource(row: SavedKeywordRow) {
  return {
    cpc: row.cpc,
    difficulty: row.difficulty,
    id: row.publicId,
    intent: row.intent,
    location: row.location,
    savedAt: row.savedAt,
    sourceSeed: row.sourceSeed,
    text: row.text,
    trend: row.trend,
    variantCount: row.variantCount,
    volume: row.volume,
  };
}

export async function listProjectSavedKeywords(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;

  const saved = await listSavedKeywordRows(ctx.auth.project.id);
  const { nextCursor, page } = paginateArray(ctx.url, saved);

  // No `total` in meta: every other list endpoint exposes only next_cursor.
  return listResponse(page.map(savedKeywordApiResource).map(snakeizeKeys), nextCursor, {
    headers: ctx.headers,
  });
}

export async function createProjectSavedKeywords(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;

  const body = await readJsonBody(ctx);
  const input = parseApiInput(createSavedKeywordsSchema, objectBody(body));
  const [defaults, keywords] = await Promise.all([
    prisma.projectDefaults.findUnique({
      where: { projectId: ctx.auth.project.id },
    }),
    prisma.keyword.findMany({
      select: keywordMarketSelect,
      where: { projectId: ctx.auth.project.id },
    }),
  ]);
  const market = projectDefaultSerpMarket(defaults, keywords);
  const rows = input.keywords.map((item) => savedKeywordRow(item, market.locationKey));
  const outcome = await runDomain(() =>
    saveSavedKeywordRows(rows, {
      actorId: ctx.actorId ?? null,
      projectId: ctx.auth.project.id,
      projectPublicId: ctx.auth.project.publicId,
    }),
  );

  return resourceResponse(
    snakeizeKeys({
      duplicateCount: outcome.duplicateCount,
      results: outcome.results,
      savedCount: outcome.savedCount,
    }),
    { headers: ctx.headers, status: 201 },
  );
}

export async function deleteProjectSavedKeyword(
  ctx: ApiContext,
  savedKeywordId: string,
  projectId: string,
) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;

  const result = await runDomain(() =>
    removeSavedKeywordRows(
      { publicIds: [savedKeywordId] },
      {
        actorId: ctx.actorId ?? null,
        projectId: ctx.auth.project.id,
        projectPublicId: ctx.auth.project.publicId,
      },
    ),
  );

  return resourceResponse(snakeizeKeys(result), { headers: ctx.headers });
}
