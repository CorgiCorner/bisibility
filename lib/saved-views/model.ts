import {
  type CompetitorSavedViewConfig,
  competitorSavedViewConfigSchema,
} from "@/lib/competitors/saved-view-model";
import { isPublicIdOfType } from "@/lib/db/public-id";
import {
  type KeywordSavedView,
  type SavedViewConfig,
  savedViewConfigSchema,
  savedViewNameSchema,
} from "@/lib/keywords/saved-view-model";
import { z } from "zod";
import { viewRevisionSchema } from "./canonical-model";
import {
  legacyProjectViewScope,
  normalizeStoredViewConfig,
  type ProjectViewConfig,
  savedViewSurfaceSchema,
} from "./config-model";

export type { SavedViewSurface } from "./config-model";
export { inferSavedViewSurface, savedViewSurfaceSchema, savedViewSurfaces } from "./config-model";

import type { SavedViewSurface } from "./config-model";

const idSchema = z.string().trim().min(1);

export const projectSavedViewConfigSchema = z.union([
  competitorSavedViewConfigSchema,
  savedViewConfigSchema,
]);

export const createProjectSavedViewSchema = savedViewNameSchema
  .extend({
    config: projectSavedViewConfigSchema,
    projectId: idSchema,
    surface: savedViewSurfaceSchema.optional(),
  })
  .strict()
  .refine((input) => input.surface === undefined || input.surface === input.config.surface, {
    message: "Saved view surface must match its config",
    path: ["surface"],
  });
export type CreateProjectSavedViewInput = z.infer<typeof createProjectSavedViewSchema>;

export type CompetitorSavedView = {
  canDelete: boolean;
  config: CompetitorSavedViewConfig;
  createdAt: string;
  id: string;
  name: string;
  surface: "competitors";
};

export type SavedViewResource = {
  [Surface in SavedViewSurface]: Extract<
    KeywordSavedView | CompetitorSavedView,
    { surface: Surface }
  > & {
    definition: Extract<ProjectViewConfig, { surface: Surface }>;
    revision: number;
    visibility: "project";
  };
}[SavedViewSurface];

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
  ownerId: string | null;
  revision: number;
  visibility: "private" | "project";
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
  if (
    view.visibility !== "project" ||
    view.ownerId !== null ||
    !viewRevisionSchema.safeParse(view.revision).success
  )
    return null;
  const definition = normalizeStoredViewConfig(view.config, view.surface);
  if (!definition) return null;
  const normalized = { config: legacyProjectViewScope(definition), surface: definition.surface };
  if (definition.surface === "competitors") {
    return normalized.config.surface === "competitors"
      ? {
          canDelete,
          definition,
          revision: view.revision,
          visibility: "project",
          config: normalized.config,
          createdAt: view.createdAt.toISOString(),
          id: requiredPublicId(view.publicId),
          name: view.name,
          surface: "competitors",
        }
      : null;
  }
  if (definition.surface !== "keywords" || normalized.config.surface !== "keywords") return null;
  return {
    canDelete,
    definition,
    revision: view.revision,
    visibility: "project",
    config: normalized.config,
    createdAt: view.createdAt.toISOString(),
    id: requiredPublicId(view.publicId),
    name: view.name,
    surface: "keywords",
  };
}

export function normalizeProjectSavedView(
  config: unknown,
  explicitSurface?: unknown,
): NormalizedProjectSavedView | null {
  const decoded = normalizeStoredViewConfig(config, explicitSurface);
  if (!decoded) return null;
  const scope = legacyProjectViewScope(decoded);
  return { config: scope, surface: scope.surface };
}
