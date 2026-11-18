import { expect, it } from "vitest";
import { modelResultWithUsageEstimate } from "./result-estimate";
import { measuredResult, pricedBinding, reportedResult } from "./usage.test-support";

it("projects a frozen-rate estimate without rewriting native evidence or inventing missing usage", () => {
  const response = measuredResult();
  const before = structuredClone(response);
  const view = modelResultWithUsageEstimate(response, pricedBinding());
  expect(view.providerCost).toEqual({
    amount: "0.000131",
    currency: "USD",
    certainty: "estimated",
    basis: "rate_card",
    rateCardVersion: "rates-v1",
  });
  expect(response).toEqual(before);
  response.usage.inputTokens = null;
  expect(modelResultWithUsageEstimate(response, pricedBinding())).toBe(response);
  const reported = reportedResult();
  expect(modelResultWithUsageEstimate(reported, pricedBinding())).toBe(reported);
  expect(modelResultWithUsageEstimate(before, undefined)).toBe(before);
  const changed = pricedBinding();
  changed.column.modelId = "different-model";
  expect(modelResultWithUsageEstimate(before, changed)).toBe(before);
});
