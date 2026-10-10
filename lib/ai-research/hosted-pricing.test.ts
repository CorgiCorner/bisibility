import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/execution-extension", () => ({}));
vi.mock("@/lib/providers/rate-limit", () => ({}));
vi.mock("@/lib/providers/serp/dataforseo", () => ({}));
vi.mock("@/lib/deployment/runtime-env.generated", () => ({}));

import { deploymentEstimate } from "@/lib/provider-lookups/paid-call-deployment";
import { capabilities } from "./catalog-fixtures.test-support";
import { modelAdmissionBound } from "./cost";
import { promptSchema } from "./schema";

describe("hosted AI admission precision", () => {
  it.each(capabilities.catalog.models.map((model) => model.id))(
    "serializes the conservative %s bound without financial truncation",
    (model) => {
      const input = promptSchema.parse({
        brand: "Acme",
        domain: "acme.com",
        prompt: "q",
        models: [model],
        max_cost_cents: 60,
      });
      expect(() =>
        deploymentEstimate(modelAdmissionBound(model, input, capabilities), 4),
      ).not.toThrow();
    },
  );
  it("admits a newly cataloged model with explicit fixture pricing without fixed model enums", () => {
    const model = { ...capabilities.catalog.models[0], id: "gpt-5-mini", label: "gpt-5-mini" };
    const rate = capabilities.modelRates.get("gpt-4.1-mini");
    if (!rate) throw new Error("Missing model pricing fixture.");
    const expanded = {
      ...capabilities,
      catalog: { ...capabilities.catalog, models: [...capabilities.catalog.models, model] },
      modelRates: new Map([...capabilities.modelRates, [model.id, rate]]),
    };
    const input = promptSchema.parse({
      brand: "Acme",
      domain: "acme.com",
      prompt: "q",
      models: [model.id],
      max_output_tokens: 4096,
      max_cost_cents: 60,
    });
    const cost = modelAdmissionBound(model.id, input, expanded);
    expect(cost).toBe(4.0792);
    expect(() => deploymentEstimate(cost, 4)).not.toThrow();
  });
});
