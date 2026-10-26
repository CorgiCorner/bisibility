import { expect, it } from "vitest";
import { researchDefaults } from "./AiEngineFields";
import { aiResearchCatalogFixture } from "./ai-research-fixtures";

const catalog = {
  ...aiResearchCatalogFixture,
  models: [
    ...aiResearchCatalogFixture.models,
    {
      ...aiResearchCatalogFixture.models[0],
      id: "gpt-6-luna",
      label: "GPT-6 Luna",
      reasoning: true,
      minOutputTokens: 1024,
      priceAvailable: false,
      admissionEnabled: false,
      actualCostEnabled: false,
    },
    {
      ...aiResearchCatalogFixture.models[0],
      id: "gpt-5.6-luna",
      label: "GPT-5.6 Luna",
      reasoning: true,
      minOutputTokens: 1024,
      admissionEnabled: false,
    },
  ],
};

it("defaults own-key prompts to a priced Luna without accepting actual-cost consent", () => {
  const value = researchDefaults("prompt", "example.com", [], catalog);
  expect(value).toMatchObject({
    models: ["gpt-5.6-luna"],
    cost_policy: "provider_actual_cost",
    max_output_tokens: 1024,
    estimated_cost_limit_cents: 60,
  });
  expect(value).not.toHaveProperty("actual_cost_acknowledgement");
  expect(value).not.toHaveProperty("max_cost_cents");
});
it("does not select a model without confirmed price and actual-cost support", () => {
  const unavailable = {
    ...catalog,
    models: catalog.models.map((model) => ({ ...model, actualCostEnabled: false })),
  };
  expect(researchDefaults("prompt", "example.com", [], unavailable)).toMatchObject({
    models: ["gpt-4.1-mini", "gpt-4.1-nano"],
    cost_policy: "hard_cap",
  });
});
it("keeps the calibrated Credits engine route independent of model defaults", () => {
  expect(
    researchDefaults(
      "prompt",
      "example.com",
      [{ engine: "chat_gpt", model: "gpt-5.6-luna" }],
      catalog,
    ),
  ).toMatchObject({ engines: ["chat_gpt"], cost_policy: "hard_cap" });
});
