import { competitorSavedViewConfigSchema } from "@/lib/competitors/saved-view-model";
import {
  type CompetitorViewConfig,
  competitorSavedViewV2Schema,
  competitorViewLegacyScope,
} from "@/lib/competitors/saved-view-v2-model";
import { savedViewConfigSchema } from "@/lib/keywords/saved-view-model";
import {
  type KeywordViewConfig,
  keywordSavedViewV2Schema,
  keywordViewLegacyScope,
} from "@/lib/keywords/saved-view-v2-model";
import { z } from "zod";

export const savedViewSurfaces = ["keywords", "competitors"] as const;
export const savedViewSurfaceSchema = z.enum(savedViewSurfaces);
export type SavedViewSurface = z.infer<typeof savedViewSurfaceSchema>;
export type ProjectViewConfig = KeywordViewConfig | CompetitorViewConfig;

export const projectSavedViewV2ConfigSchema = z.union([
  keywordSavedViewV2Schema,
  competitorSavedViewV2Schema,
]);

export function inferSavedViewSurface(config: unknown, explicit?: unknown): SavedViewSurface {
  const parsed = savedViewSurfaceSchema.safeParse(explicit);
  if (parsed.success) return parsed.data;
  if (config && typeof config === "object" && !Array.isArray(config)) {
    const embedded = savedViewSurfaceSchema.safeParse((config as Record<string, unknown>).surface);
    if (embedded.success) return embedded.data;
  }
  return "keywords";
}

function legacyScopeIsKnown(raw: Record<string, unknown>) {
  const filters = raw.filters;
  if (filters && typeof filters === "object" && !Array.isArray(filters)) {
    for (const key of ["country", "city", "device"]) {
      const value = (filters as Record<string, unknown>)[key];
      if (value !== undefined && value !== null && value !== "" && value !== "all") return false;
    }
  }
  const lens = raw.lens;
  if (lens && typeof lens === "object" && !Array.isArray(lens)) {
    const device = (lens as Record<string, unknown>).device;
    if (
      device !== undefined &&
      (typeof device !== "string" || !["all", "desktop", "mobile"].includes(device.toLowerCase()))
    )
      return false;
  }
  return true;
}

/** Unknown versions and missing concrete legacy scope never become an all-scope query. */
export function normalizeStoredViewConfig(
  value: unknown,
  explicitSurface?: unknown,
): ProjectViewConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (explicitSurface !== undefined && !savedViewSurfaceSchema.safeParse(explicitSurface).success)
    return null;
  const raw = value as Record<string, unknown>;
  const surface = inferSavedViewSurface(raw, explicitSurface);
  if (raw.surface !== undefined && raw.surface !== surface) return null;
  if (raw.version === 2) {
    const parsed = projectSavedViewV2ConfigSchema.safeParse(raw);
    return parsed.success && parsed.data.surface === surface ? parsed.data : null;
  }
  if (raw.version !== undefined && raw.version !== 1) return null;
  if (surface === "competitors") {
    const parsed = competitorSavedViewConfigSchema.safeParse({ ...raw, surface, version: 1 });
    return parsed.success ? parsed.data : null;
  }
  if (!legacyScopeIsKnown(raw)) return null;
  const parsed = savedViewConfigSchema.safeParse({
    filters: raw.filters,
    lens: raw.lens,
    search: raw.search,
    surface,
    version: 1,
  });
  return parsed.success ? parsed.data : null;
}

/** Legacy consumers promise scope; presentation remains in the canonical versioned resource. */
export function legacyProjectViewScope(config: ProjectViewConfig) {
  return config.surface === "keywords"
    ? keywordViewLegacyScope(config)
    : competitorViewLegacyScope(config);
}
