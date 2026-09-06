import { z } from "zod";

export const experimentalModuleKeys = ["timeline", "competitors"] as const;

export type ExperimentalModuleKey = (typeof experimentalModuleKeys)[number];

export const experimentalModuleKeySchema = z.enum(experimentalModuleKeys);

export const experimentalModulesSchema = z.object({
  enabledExperimentalModules: z.array(experimentalModuleKeySchema),
  projectId: z.string().trim().min(1).max(120),
});

export type ExperimentalModulesInput = z.infer<typeof experimentalModulesSchema>;

export function normalizeExperimentalModules(
  values: readonly string[] | null | undefined,
): ExperimentalModuleKey[] {
  const enabled = new Set(values);
  return experimentalModuleKeys.filter((key) => enabled.has(key));
}

export function hasExperimentalModule(
  enabled: readonly ExperimentalModuleKey[],
  key: ExperimentalModuleKey,
): boolean {
  return enabled.includes(key);
}
