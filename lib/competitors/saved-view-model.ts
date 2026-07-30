import { z } from "zod";
import { competitorPositionBuckets, emptyCompetitorFilter } from "./competitor-market-model";
import { COMPETITOR_ENGINE, competitorScopeHref } from "./scope-model";
import type { CompetitorFilter } from "./types";

const positionValues = competitorPositionBuckets.map((bucket) => bucket.id) as [
  CompetitorFilter["position"],
  ...CompetitorFilter["position"][],
];

export const competitorFilterSchema = z
  .object({
    excludedKeywordIds: z.array(z.string().trim().min(1)).max(10_000).default([]),
    position: z.enum(positionValues).default("all"),
    tag: z.string().trim().min(1).max(40).nullable().default(null),
  })
  .strict();

export const competitorSavedViewConfigSchema = z
  .object({
    filters: competitorFilterSchema.default(emptyCompetitorFilter),
    scope: z.object({
      device: z.enum(["desktop", "mobile"]),
      engine: z.literal(COMPETITOR_ENGINE),
      locationId: z.string().trim().min(1),
    }),
    surface: z.literal("competitors"),
    version: z.literal(1),
  })
  .strict();

export type CompetitorSavedViewConfig = z.infer<typeof competitorSavedViewConfigSchema>;

export function normalizeCompetitorSavedViewConfig(value: unknown) {
  return competitorSavedViewConfigSchema.safeParse(value);
}

export function competitorSavedViewHref(
  projectRef: string,
  viewId: string,
  config: CompetitorSavedViewConfig,
) {
  return competitorScopeHref(projectRef, config.scope, viewId);
}
