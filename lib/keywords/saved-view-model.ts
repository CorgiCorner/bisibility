import { appPath } from "@/lib/routing/app-path";
import { z } from "zod";
import { emptyKeywordFilters, type KeywordFilters } from "./keyword-filter-model";
import { type ActiveLens, type LensDevice, lensHref } from "./lens-model";

const idSchema = z.string().trim().min(1);
const legacyScopeFilterKeys = ["city", "country", "device"] as const;
const lensDevices = ["all", "desktop", "mobile"] as const satisfies LensDevice[];
const emptySavedViewLens = { device: "all", locationId: null } satisfies ActiveLens;

function stripLegacyScopeFilters(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const filters = { ...(value as Record<string, unknown>) };
  for (const key of legacyScopeFilterKeys) {
    delete filters[key];
  }
  return filters;
}

export const savedViewNameSchema = z.object({
  name: z.string().trim().min(1, "Name the saved view").max(48, "Use 48 characters or fewer"),
});

export const savedViewFiltersSchema = z.preprocess(
  stripLegacyScopeFilters,
  z
    .object({
      change: z.enum(["any", "up", "down", "new", "lost"]).default("any"),
      contains: z.string().trim().max(80).default(""),
      intents: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
      lastCheck: z.enum(["any", "completed", "failed", "running"]).default("any"),
      position: z
        .array(z.enum(["top3", "top10", "11-50", "51-100"]))
        .max(4)
        .default([]),
      serp: z
        .array(z.enum(["featured", "paa", "sitelinks", "image", "video", "ai"]))
        .max(8)
        .default([]),
      tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
      topics: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
      urlChanged: z.boolean().default(false),
      volMax: z.number().min(0).max(50).default(50),
      volMin: z.number().min(0).max(50).default(0),
      wrongUrl: z.boolean().default(false),
    })
    .strict()
    .transform(
      (filters): KeywordFilters => ({
        ...filters,
        volMax: Math.max(filters.volMin, filters.volMax),
      }),
    ),
);

const savedViewLensSchema = z
  .object({
    device: z
      .preprocess(
        (value) => (typeof value === "string" ? value.toLowerCase() : value),
        z.enum(lensDevices),
      )
      .catch("all"),
    locationId: z
      .preprocess(
        (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
        z.string().trim().min(1).nullable(),
      )
      .default(null),
  })
  .default(emptySavedViewLens)
  .transform((lens): ActiveLens => ({ device: lens.device, locationId: lens.locationId }));

export const savedViewConfigSchema = z
  .object({
    filters: savedViewFiltersSchema.optional(),
    lens: savedViewLensSchema.optional(),
    search: z.string().trim().max(120).default(""),
    surface: z.literal("keywords").default("keywords"),
    version: z.literal(1).default(1),
  })
  .strict()
  .transform(
    (config): SavedViewConfig => ({
      filters: config.filters ?? emptyKeywordFilters,
      lens: config.lens ?? emptySavedViewLens,
      search: config.search,
      surface: config.surface,
      version: config.version,
    }),
  );

export const createSavedViewSchema = savedViewNameSchema.extend({
  config: savedViewConfigSchema,
  projectId: idSchema,
});

export const deleteSavedViewSchema = z.object({
  projectId: idSchema,
  viewId: idSchema,
});

export type CreateSavedViewInput = z.infer<typeof createSavedViewSchema>;
export type DeleteSavedViewInput = z.infer<typeof deleteSavedViewSchema>;
export type SavedViewFormValues = z.infer<typeof savedViewNameSchema>;
export type SavedViewConfig = {
  filters: KeywordFilters;
  lens: ActiveLens;
  search: string;
  surface: "keywords";
  version: 1;
};

export type KeywordSavedView = {
  canDelete: boolean;
  config: SavedViewConfig;
  createdAt: string;
  id: string;
  name: string;
  surface: "keywords";
};

export const emptySavedViewConfig = {
  filters: emptyKeywordFilters,
  lens: emptySavedViewLens,
  search: "",
  surface: "keywords",
  version: 1,
} satisfies SavedViewConfig;

export function cloneSavedViewConfig(config: SavedViewConfig = emptySavedViewConfig) {
  return {
    filters: {
      ...config.filters,
      position: [...config.filters.position],
      intents: [...config.filters.intents],
      serp: [...config.filters.serp],
      tags: [...config.filters.tags],
      topics: [...config.filters.topics],
    },
    lens: { ...config.lens },
    search: config.search,
    surface: "keywords",
    version: 1,
  } satisfies SavedViewConfig;
}

export function normalizeSavedViewConfig(config: unknown) {
  const parsed = savedViewConfigSchema.safeParse(config);
  return cloneSavedViewConfig(parsed.success ? parsed.data : emptySavedViewConfig);
}

export function keywordSavedViewConfig(
  config: Omit<SavedViewConfig, "surface" | "version">,
): SavedViewConfig {
  return { ...config, surface: "keywords", version: 1 };
}

export function savedViewHref(projectRef: string, viewId: string | null, lens?: ActiveLens | null) {
  const keywordsPath = appPath(projectRef, "rank-tracker");
  if (!viewId) {
    return keywordsPath;
  }

  if (lens) {
    return lensHref(keywordsPath, lens, viewId);
  }

  return `${keywordsPath}?${new URLSearchParams({ view: viewId }).toString()}`;
}
