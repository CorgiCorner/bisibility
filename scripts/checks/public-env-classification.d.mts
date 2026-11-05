export type EnvClassificationCategory =
  | "framework"
  | "internal"
  | "hostedOnly"
  | "docsOnly"
  | "test"
  | "migrationOnly"
  | "deprecated"
  | "deploymentInput";

export const envClassification: Record<EnvClassificationCategory, string[]>;
export const primaryCategories: Exclude<EnvClassificationCategory, "deploymentInput">[];
export function classifiedAllowlist(): Set<string>;
export function deploymentInputKeys(): Set<string>;
export function classifyVariable(name: string): EnvClassificationCategory | null;
