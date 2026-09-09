import { z } from "zod";

export const PROJECT_RUN_KINDS = ["rank_check", "gsc_import"] as const;
export const projectRunKindSchema = z.enum(PROJECT_RUN_KINDS);
export type ProjectRunKind = z.infer<typeof projectRunKindSchema>;

export type ProjectRunKey = Readonly<{ kind: ProjectRunKind; id: string }>;

export const PROJECT_RUN_PROGRESS_UNITS = ["targets", "days"] as const;
export const projectRunProgressUnitSchema = z.enum(PROJECT_RUN_PROGRESS_UNITS);
export type ProjectRunProgressUnit = z.infer<typeof projectRunProgressUnitSchema>;

export type ProjectRunProgress<Unit extends ProjectRunProgressUnit = ProjectRunProgressUnit> =
  Readonly<{
    completed: number | null;
    total: number | null;
    unit: Unit;
  }>;

export type ProjectRunCapabilities = Readonly<{
  cancel: boolean;
  pause: boolean;
  resume: boolean;
  retry: boolean;
  viewDetails: boolean;
}>;
