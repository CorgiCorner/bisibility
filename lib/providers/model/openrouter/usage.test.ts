import { describe, expect, it } from "vitest";
import { normalizeOpenRouterResponse } from "./normalize";
import { canary, forbidNetwork, normal } from "./test-support";
import { normalizeOpenRouterAccounting } from "./usage";

forbidNetwork();
const normalize = (body: unknown) => normalizeOpenRouterResponse(body, false, canary);

describe("cost certainty and incomplete dimensions", () => {
  it("keeps exact decimal evidence separate from upstream costs and estimates", () => {
    // Synthetic post-parser strings, not a claim that numeric wire fields are strings.
    const accounting = normalizeOpenRouterAccounting(
      {
        usage: {
          cost: "0.0000000001234567890123456789",
          cost_details: {
            upstream_inference_cost: "0.0000000001",
            upstream_inference_prompt_cost: "0.00000000006",
          },
        },
      },
      true,
    );
    expect(accounting.costEvidence.providerReported?.money).toMatchObject({
      amount: "0.0000000001234567890123456789",
      certainty: "reported",
      basis: "provider_response",
    });
    expect(accounting.providerCost.amount).toBeNull();
    expect(accounting.costEvidence.upstreamInference?.total?.amount).toBe("0.0000000001");
    expect(accounting.costEvidence.upstreamInference?.input?.amount).toBe("0.00000000006");
    expect(accounting.costEvidence.localEstimate).toBeNull();
    expect(accounting.costEvidence.upstreamInference?.output).toBeNull();
    expect(
      normalize({ ...normal(), usage: { is_byok: false, cost: "0.125" } }).providerCost.amount,
    ).toBe("0.125");
  });

  it.each([
    undefined,
    null,
    0,
    0.95,
    1e-9,
    -1,
    "-1",
    "NaN",
    "pending",
    "1e-9",
    "0.1USD",
    Number.POSITIVE_INFINITY,
  ])("keeps missing, pending, malformed or lossy numeric cost %s unknown", (cost) => {
    expect(normalizeOpenRouterAccounting({ usage: { cost } }, false).providerCost).toMatchObject({
      amount: null,
      certainty: "unknown",
    });
  });

  it("retains only explicitly reported string zero and never substitutes upstream costs", () => {
    expect(
      normalizeOpenRouterAccounting({ usage: { is_byok: false, cost: "0" } }, false).providerCost
        .amount,
    ).toBe("0");
    expect(
      normalizeOpenRouterAccounting(
        { usage: { cost_details: { upstream_inference_cost: "1" } } },
        false,
      ).providerCost.amount,
    ).toBeNull();
  });

  it.each([
    undefined,
    {},
    { prompt_tokens: 10 },
    { completion_tokens_details: { reasoning_tokens: 3 } },
    {
      prompt_tokens: 1,
      completion_tokens: 1,
      prompt_tokens_details: { cached_tokens: 9 },
      completion_tokens_details: { reasoning_tokens: 9 },
    },
    { prompt_tokens: -1, completion_tokens: 1.5 },
  ])("normalizes partial/invalid usage without guessed zeros", (usage) => {
    const result = normalize({ ...normal(), usage });
    expect(result.providerCost.amount).toBeNull();
    expect(result.usage.completeness).not.toBe("complete");
    expect(result.usage.searchCalls).toBeNull();
  });
});
