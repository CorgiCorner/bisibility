import { isPublicIdOfType } from "@/lib/db/public-id";
import { MAX_VIEW_REVISION } from "@/lib/saved-views/canonical-model";
import { tablePresentationSchema } from "@/lib/saved-views/presentation-model";
import { z } from "zod";

export const preferenceSurfaceSchema = z.enum(["keywords", "competitors", "dashboard"]);
export type PreferenceSurface = z.infer<typeof preferenceSurfaceSchema>;
export const tablePreferenceSurfaceSchema = z.enum(["keywords", "competitors"]);
export type TablePreferenceSurface = z.infer<typeof tablePreferenceSurfaceSchema>;
export const generalPresetId = "general" as const;

const projectId = z
  .string()
  .trim()
  .refine((id) => isPublicIdOfType(id, "prj"));
const viewId = z
  .string()
  .trim()
  .refine((id) => isPublicIdOfType(id, "viw"));
const expectedRevision = z.int().nonnegative().max(MAX_VIEW_REVISION);
const presetTarget = z
  .object({ kind: z.literal("preset"), presetId: z.literal(generalPresetId) })
  .strict();
const savedTarget = z.object({ kind: z.literal("saved_view"), viewId }).strict();

export const setPersonalDefaultSchema = z
  .object({
    expectedRevision,
    projectId,
    surface: tablePreferenceSurfaceSchema,
    target: z.discriminatedUnion("kind", [presetTarget, savedTarget]),
  })
  .strict();

export const savePersonalPresentationSchema = z
  .object({
    expectedRevision,
    presentation: tablePresentationSchema.nullable(),
    projectId,
    surface: tablePreferenceSurfaceSchema,
  })
  .strict();

export type PersonalDefaultTarget = z.infer<typeof setPersonalDefaultSchema>["target"];
export type SetPersonalDefaultInput = z.input<typeof setPersonalDefaultSchema>;
export type SavePersonalPresentationInput = z.input<typeof savePersonalPresentationSchema>;
export type UserProjectSurfacePreference = {
  defaultTarget: PersonalDefaultTarget;
  notice: "unavailable_default" | null;
  presentation: z.infer<typeof tablePresentationSchema> | null;
  projectId: string;
  revision: number;
  schemaVersion: 1;
  surface: PreferenceSurface;
};

export function generalPreference(
  projectId: string,
  surface: PreferenceSurface,
): UserProjectSurfacePreference {
  return {
    defaultTarget: { kind: "preset", presetId: generalPresetId },
    notice: null,
    presentation: null,
    projectId,
    revision: 0,
    schemaVersion: 1,
    surface,
  };
}
