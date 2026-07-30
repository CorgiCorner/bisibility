import {
  type CompetitorSavedViewConfig,
  competitorSavedViewConfigSchema,
} from "@/lib/competitors/saved-view-model";
import { isPublicIdOfType } from "@/lib/db/public-id";
import {
  type KeywordSavedView,
  normalizeSavedViewConfig,
  type SavedViewConfig,
  savedViewConfigSchema,
  savedViewNameSchema,
} from "@/lib/keywords/saved-view-model";
import { z } from "zod";

const idSchema = z.string().trim().min(1);

export const projectSavedViewConfigSchema = z.union([
  competitorSavedViewConfigSchema,
  savedViewConfigSchema,
]);

export const createProjectSavedViewSchema = savedViewNameSchema.extend({
  config: projectSavedViewConfigSchema,
  projectId: idSchema,
});

export const savedViewSurfaces = ["keywords", "competitors"] as const;
export const savedViewSurfaceSchema = z.enum(savedViewSurfaces);
export type SavedViewSurface = z.infer<typeof savedViewSurfaceSchema>;
export type CreateProjectSavedViewInput = z.infer<typeof createProjectSavedViewSchema>;

export type CompetitorSavedView = {
  canDelete: boolean;
  config: CompetitorSavedViewConfig;
  createdAt: string;
  id: string;
  name: string;
  surface: "competitors";
};

export type SavedViewResource = KeywordSavedView | CompetitorSavedView;

export type NormalizedProjectSavedView = {
  config: CompetitorSavedViewConfig | SavedViewConfig;
  surface: SavedViewSurface;
};

type SavedViewRecord = {
  config: unknown;
  createdAt: Date;
  createdById: string | null;
  id: string;
  name: string;
  publicId: string | null;
  surface: string;
};

function requiredPublicId(value: string | null) {
  if (!value || !isPublicIdOfType(value, "viw")) {
    throw new Error("Saved view public ID is not available.");
  }
  return value;
}

export function mapSavedViewRecord(
  view: SavedViewRecord,
  canDelete: boolean,
): SavedViewResource | null {
  const normalized = normalizeProjectSavedView(view.config, view.surface);
  if (!normalized) return null;
  if (normalized.surface === "competitors") {
    return normalized.config.surface === "competitors"
      ? {
          canDelete,
          config: normalized.config,
          createdAt: view.createdAt.toISOString(),
          id: requiredPublicId(view.publicId),
          name: view.name,
          surface: "competitors",
        }
      : null;
  }
  if (normalized.config.surface !== "keywords") return null;
  return {
    canDelete,
    config: normalized.config,
    createdAt: view.createdAt.toISOString(),
    id: requiredPublicId(view.publicId),
    name: view.name,
    surface: "keywords",
  };
}

export function inferSavedViewSurface(config: unknown, explicit?: unknown): SavedViewSurface {
  const parsed = savedViewSurfaceSchema.safeParse(explicit);
  if (parsed.success) return parsed.data;
  if (config && typeof config === "object" && !Array.isArray(config)) {
    const embedded = savedViewSurfaceSchema.safeParse((config as Record<string, unknown>).surface);
    if (embedded.success) return embedded.data;
  }
  return "keywords";
}

function legacyKeywordConfig(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return config;
  const raw = config as Record<string, unknown>;
  return {
    filters: raw.filters,
    lens: raw.lens,
    search: raw.search,
    surface: "keywords",
    version: 1,
  };
}

export function normalizeProjectSavedView(
  config: unknown,
  explicitSurface?: unknown,
): NormalizedProjectSavedView | null {
  const surface = inferSavedViewSurface(config, explicitSurface);
  if (surface === "competitors") {
    const raw =
      config && typeof config === "object" && !Array.isArray(config)
        ? (config as Record<string, unknown>)
        : null;
    const parsed = competitorSavedViewConfigSchema.safeParse(
      raw ? { ...raw, surface, version: raw.version ?? 1 } : config,
    );
    return parsed.success ? { config: parsed.data, surface } : null;
  }
  return { config: normalizeSavedViewConfig(legacyKeywordConfig(config)), surface };
}
