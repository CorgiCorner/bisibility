import { isPublicIdOfType } from "@/lib/db/public-id";
import { savedViewNameSchema } from "@/lib/keywords/saved-view-model";
import { z } from "zod";
import {
  normalizeStoredViewConfig,
  type ProjectViewConfig,
  projectSavedViewV2ConfigSchema,
  savedViewSurfaceSchema,
} from "./config-model";
import { fitsSavedViewPayload } from "./presentation-model";

export const savedViewVisibilitySchema = z.enum(["private", "project"]);
export type SavedViewVisibility = z.infer<typeof savedViewVisibilitySchema>;
const projectId = z
  .string()
  .trim()
  .refine((id) => isPublicIdOfType(id, "prj"));
const viewId = z
  .string()
  .trim()
  .refine((id) => isPublicIdOfType(id, "viw"));
export const MAX_VIEW_REVISION = 2147483647;
export const viewRevisionSchema = z.int().positive().max(MAX_VIEW_REVISION);

export const createSavedViewV2Schema = savedViewNameSchema
  .extend({
    config: projectSavedViewV2ConfigSchema,
    projectId,
    requestId: z.string().trim().min(8).max(128),
    visibility: savedViewVisibilitySchema.default("private"),
  })
  .strict()
  .refine(fitsSavedViewPayload, "Keep the saved view within 512 KiB");

export const updateSavedViewV2Schema = savedViewNameSchema
  .extend({
    config: projectSavedViewV2ConfigSchema,
    expectedRevision: viewRevisionSchema,
    projectId,
    viewId,
  })
  .strict()
  .refine(fitsSavedViewPayload, "Keep the saved view within 512 KiB");

export const deleteSavedViewV2Schema = z
  .object({ expectedRevision: viewRevisionSchema, projectId, viewId })
  .strict();

export type CreateSavedViewV2Input = z.input<typeof createSavedViewV2Schema>;
export type UpdateSavedViewV2Input = z.input<typeof updateSavedViewV2Schema>;
export type DeleteSavedViewV2Input = z.input<typeof deleteSavedViewV2Schema>;

type CanonicalView<TConfig extends ProjectViewConfig> = {
  canDelete: boolean;
  canEdit: boolean;
  config: TConfig;
  createdAt: string;
  id: string;
  name: string;
  projectId: string;
  revision: number;
  surface: TConfig["surface"];
  visibility: SavedViewVisibility;
};
export type CanonicalSavedViewResource = {
  [Surface in "keywords" | "competitors"]: CanonicalView<
    Extract<ProjectViewConfig, { surface: Surface }>
  >;
}["keywords" | "competitors"];

export type CanonicalSavedViewRecord = {
  config: unknown;
  createdAt: Date;
  createdById: string | null;
  id: string;
  name: string;
  ownerId: string | null;
  publicId: string;
  revision: number;
  surface: string;
  visibility: SavedViewVisibility;
};

export const canonicalSavedViewSelect = {
  config: true,
  createdAt: true,
  createdById: true,
  id: true,
  name: true,
  ownerId: true,
  publicId: true,
  revision: true,
  surface: true,
  visibility: true,
} as const;

export function mapCanonicalSavedViewRecord(
  row: CanonicalSavedViewRecord,
  access: { canDelete: boolean; canEdit: boolean; projectId: string },
): CanonicalSavedViewResource | null {
  if (
    !isPublicIdOfType(row.publicId, "viw") ||
    !viewRevisionSchema.safeParse(row.revision).success ||
    (row.visibility === "private"
      ? !row.ownerId
      : row.visibility !== "project" || row.ownerId !== null)
  )
    return null;
  const surface = savedViewSurfaceSchema.safeParse(row.surface);
  const config = normalizeStoredViewConfig(row.config, row.surface);
  if (!surface.success || !config || config.surface !== surface.data) return null;
  const common = {
    ...access,
    createdAt: row.createdAt.toISOString(),
    id: row.publicId,
    name: row.name,
    revision: row.revision,
    visibility: row.visibility,
  };
  return config.surface === "keywords"
    ? { ...common, config, surface: "keywords" }
    : { ...common, config, surface: "competitors" };
}
