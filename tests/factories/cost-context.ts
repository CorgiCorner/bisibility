import type { ProjectCostContext } from "@/lib/queries/cost-calculator";

export function makeCostContext(overrides: Partial<ProjectCostContext> = {}): ProjectCostContext {
  return {
    capCents: 5000,
    costPerCheckCents: 1,
    cronExpression: null,
    depth: 100,
    deviceCount: 1,
    devices: ["desktop"],
    frequency: "daily",
    keywordCount: 4,
    locationCount: 1,
    projectName: "Example",
    providerId: "dataforseo",
    rawFrequency: "daily",
    spentCents: 0,
    timezone: "UTC",
    ...overrides,
  };
}
