import { describe, expect, it, vi } from "vitest";
import { analyzeQuerySchema, rowsBodySchema } from "./backlinks";
import { metricsBodySchema, researchQuerySchema } from "./keyword-research";
import { querySchema } from "./ranked-keywords";
import { runRankCheckSchema } from "./schemas";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/backlinks/service", () => ({}));
vi.mock("@/lib/keyword-research/service", () => ({}));
vi.mock("@/lib/ranked-keywords/service", () => ({}));

const schemas = [
  ["backlinks", analyzeQuerySchema.shape.max_cost_cents],
  ["backlink rows", rowsBodySchema.shape.max_cost_cents],
  ["research", researchQuerySchema.shape.maxCostCents],
  ["metrics", metricsBodySchema.shape.max_cost_cents],
  ["ranked keywords", querySchema.shape.maxCostCents],
  ["rank check", runRankCheckSchema.shape.max_cost_cents],
] as const;

describe.each(schemas)("%s cost input", (_name, schema) => {
  it.each([0, 1, 10, undefined])("accepts %s", (value) => {
    expect(schema.safeParse(value).success).toBe(true);
  });
  it.each([-1, 0.5])("rejects %s", (value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });
});
