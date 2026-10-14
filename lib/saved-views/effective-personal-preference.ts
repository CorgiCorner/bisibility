import type {
  PersonalDefaultTarget,
  UserProjectSurfacePreference,
} from "@/lib/project-surface-preferences/model";

/** Read projection only. Null represents an unavailable saved default; persisted rows and writes stay nonnull. */
export type EffectivePersonalPreference = Omit<UserProjectSurfacePreference, "defaultTarget"> & {
  defaultTarget: PersonalDefaultTarget | null;
};
