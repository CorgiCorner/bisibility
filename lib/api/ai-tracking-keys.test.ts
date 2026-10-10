import { expect, it } from "vitest";
import { trackingCamelizeKeys, trackingSnakeizeKeys } from "./ai-tracking-keys";

it("preserves provider parameter and raw keys while adapting public boundary names", () => {
  const body = {
    prompt_ids: ["aip"],
    configurations: [
      {
        parameters: {
          language_code: "en",
          location_code: 2840,
          max_output_tokens: 1024,
          cost_policy: "provider_actual_cost",
        },
      },
    ],
    actor_id: "trusted",
  };
  expect(trackingCamelizeKeys(body)).toEqual({
    promptIds: ["aip"],
    configurations: body.configurations,
    actorId: "trusted",
  });
  expect(
    trackingSnakeizeKeys({
      promptRevisionId: "apr",
      evidence: { actualModel: null, raw: { nestedKey: { ProviderCase: "exact" } } },
    }),
  ).toEqual({
    prompt_revision_id: "apr",
    evidence: { actual_model: null, raw: { nestedKey: { ProviderCase: "exact" } } },
  });
});
