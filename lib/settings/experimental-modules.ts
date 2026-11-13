import { z } from "zod";

export const experimentalModuleKeys = ["competitors"] as const;

export type ExperimentalModuleKey = (typeof experimentalModuleKeys)[number];

export const experimentalModuleKeySchema = z.enum(experimentalModuleKeys);

/** Stored rows may still contain retired keys. Drop those before the current enum. */
const retiredExperimentalModules = new Set(["timeline", "promptPlayground"]);
const storedExperimentalModulesSchema = z.preprocess(
  (value) =>
    Array.isArray(value) ? value.filter((item) => !retiredExperimentalModules.has(item)) : value,
  z.array(experimentalModuleKeySchema),
);

export const experimentalModulesSchema = z.object({
  enabledExperimentalModules: storedExperimentalModulesSchema,
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
