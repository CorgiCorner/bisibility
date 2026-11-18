import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOpenRouterProvider } from "./adapter";
import { canary, catalog, context, normal, observer, request, web } from "./test-support";

vi.unmock("@/lib/providers/model/transport");
vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: vi.fn(async () => ({ success: true })),
}));

let outbound: ReturnType<typeof vi.fn<typeof fetch>>;
let unexpected: boolean;
const response = (body: string) =>
  new Response(body, {
    headers: { "content-type": "application/json", "x-request-id": "req_P07COSTEVIDENCE" },
  });
beforeEach(() => {
  unexpected = false;
  outbound = vi.fn<typeof fetch>(async () => {
    unexpected = true;
    throw new Error("Unexpected outbound request");
  });
  vi.stubGlobal("fetch", outbound);
});
afterEach(() => {
  expect(unexpected).toBe(false);
  vi.unstubAllGlobals();
});
async function ready() {
  outbound.mockResolvedValueOnce(response(JSON.stringify(catalog())));
  const provider = createOpenRouterProvider();
  expect((await provider.probe(context())).state).toBe("catalog_available");
  return provider;
}
// Synthetic raw numeric JSON, preserving lexemes that JSON.stringify would round.
function wire(field: string, literal: string) {
  const usage = { ...normal().usage, cost_details: {} };
  const token = "SYNTHETIC_MONEY_LITERAL";
  const monetary =
    field === "cost" ? { ...usage, cost: token } : { ...usage, cost_details: { [field]: token } };
  return JSON.stringify({ ...normal(), usage: monetary }).replace(JSON.stringify(token), literal);
}
const fields = [
  ["cost", "providerReported"],
  ["upstream_inference_cost", "total"],
  ["upstream_inference_prompt_cost", "input"],
  ["upstream_inference_completions_cost", "output"],
] as const;

describe("lossless wire money through bounded transport", () => {
  it.each(fields)("constructs a unique usage object for %s", (field) => {
    const text = wire(field, "0.1234567890123456789");
    expect(text.match(/"cost":/g)).toHaveLength(1);
    expect(text.match(/"cost_details":/g)).toHaveLength(1);
    expect(JSON.parse(text).usage).toMatchObject({ is_byok: false, prompt_tokens: 194 });
  });

  for (const [field, slot] of fields) {
    it.each([
      ["0.0000000001234567890123456789", "0.0000000001234567890123456789"],
      ["9007199254740993", "9007199254740993"],
      ["1e-325", `0.${"0".repeat(324)}1`],
      ["0", "0"],
    ])(`preserves ${field} numeric token %s`, async (literal, exact) => {
      const provider = await ready();
      outbound.mockResolvedValueOnce(response(wire(field, literal)));
      const fence = observer();
      const value = await provider.generate(context(), request(), fence);
      const money =
        slot === "providerReported"
          ? value.costEvidence?.providerReported?.money
          : value.costEvidence?.upstreamInference?.[slot];
      expect(money).toEqual({
        amount: exact,
        currency: "USD",
        certainty: "reported",
        basis: "provider_response",
        rateCardVersion: null,
      });
      expect(value.usage.inputTokens).toBe(194);
      expect(typeof value.usage.inputTokens).toBe("number");
      expect(fence.beforeDispatch).toHaveBeenCalledOnce();
      expect(fence.settle).toHaveBeenCalledExactlyOnceWith(request().operationKey, value);
      expect(outbound).toHaveBeenCalledTimes(2);
    });
  }

  it("settles numeric searched cost as subtotal without reporting a total", async () => {
    const provider = await ready();
    outbound.mockResolvedValueOnce(response(wire("cost", "0.0042")));
    const input = request();
    input.column.settings.search.mode = "openrouter_web_exa";
    const fence = observer();
    const value = await provider.generate(context(), input, fence);
    expect(value.providerCost).toMatchObject({ amount: null, certainty: "unknown" });
    expect(value.costEvidence?.providerReported).toMatchObject({
      money: { amount: "0.0042" },
      scope: { kind: "subtotal", unknown: expect.arrayContaining(["tools"]) },
    });
    expect(fence.settle).toHaveBeenCalledExactlyOnceWith(input.operationKey, value);
    expect(outbound).toHaveBeenCalledTimes(2);
  });

  it("settles retained upstream total and downgraded account charge", async () => {
    const provider = await ready();
    outbound.mockResolvedValueOnce(
      response(
        wire("upstream_inference_cost", "0.1").replace(
          '"upstream_inference_cost":0.1',
          '"upstream_inference_cost":0.1,"upstream_inference_prompt_cost":0.100000000000000000001',
        ),
      ),
    );
    const fence = observer();
    const value = await provider.generate(context(), request(), fence);
    expect(value).toMatchObject({
      state: "completed",
      failure: null,
      answer: "Synthetic answer.",
      providerRequestId: normal().id,
      usage: { inputTokens: 194, outputTokens: 20 },
      providerCost: { amount: null, certainty: "unknown" },
      costEvidence: {
        providerReported: {
          money: { amount: "0.000123456789" },
          scope: {
            kind: "subtotal",
            includes: [],
            excludes: [],
            unknown: [
              "inference",
              "tools",
              "routing",
              "reporting_writes",
              "zero_data_retention",
              "other",
            ],
          },
        },
        upstreamInference: { total: { amount: "0.1" }, input: null, output: null },
      },
    });
    expect(fence.settle).toHaveBeenCalledExactlyOnceWith(request().operationKey, value);
    expect(outbound).toHaveBeenCalledTimes(2);
  });

  it("settles a failed title-echo result with measured usage and cost retained", async () => {
    const provider = await ready();
    const body = web();
    Object.assign(body.usage, normal().usage);
    body.choices[0].message.annotations[0].url_citation.title = "x".repeat(250) + canary;
    outbound.mockResolvedValueOnce(response(JSON.stringify(body)));
    const fence = observer();
    const settled = await provider.generate(context(), request(), fence);
    expect(fence.settle).toHaveBeenCalledExactlyOnceWith(request().operationKey, settled);
    expect(settled).toMatchObject({
      state: "failed",
      failure: "invalid_response",
      citations: [],
      answer: null,
      truncation: { citations: true },
      usage: { inputTokens: 194, outputTokens: 20 },
      costEvidence: { providerReported: { money: { amount: "0.000123456789" } } },
      providerCost: { amount: "0.000123456789", certainty: "reported" },
    });
    expect(JSON.stringify(settled)).not.toContain(canary.slice(0, 6));
    expect(outbound).toHaveBeenCalledTimes(2);
  });
});
