import { modelColumnResultSchema } from "@/lib/model-playground/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import routed from "./__fixtures__/routed.json";
import { vercelAiGatewayProvider as adapter } from "./adapter";
import { context, key, observer, request } from "./adapter.test-support";

vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: vi.fn(async () => ({ success: true })),
}));

let wire: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  wire = vi.fn<typeof fetch>(async () => {
    throw new Error("Unexpected network");
  });
  vi.stubGlobal("fetch", wire);
});
afterEach(() => vi.unstubAllGlobals());

// All variants are synthetic; the combined REST metadata shape remains unverified.
const fixture = () => structuredClone(routed);
async function generate(body: unknown) {
  const meter = observer();
  wire.mockImplementationOnce(async () => {
    expect(meter.beforeDispatch).toHaveBeenCalledExactlyOnceWith(request().operationKey);
    return new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json", "x-request-id": "req_SYNTHETICEXT123" },
    });
  });
  const result = await adapter.generate(context(), request(), meter);
  expect(modelColumnResultSchema.safeParse(result).success).toBe(true);
  expect(wire).toHaveBeenCalledTimes(1);
  expect(meter.settle).toHaveBeenCalledExactlyOnceWith(request().operationKey, result);
  return result;
}

const unknownMoney = {
  amount: null,
  currency: "USD",
  certainty: "unknown",
  basis: "unknown",
  rateCardVersion: null,
};
const unknownEvidence = {
  providerReported: null,
  upstreamInference: null,
  localEstimate: null,
};
const subtotalScope = {
  kind: "subtotal",
  includes: ["inference", "tools"],
  excludes: ["reporting_writes", "zero_data_retention"],
  unknown: ["routing", "other"],
};

function expectUnknown(result: Awaited<ReturnType<typeof generate>>) {
  expect(result.providerCost).toEqual(unknownMoney);
  expect(result.costEvidence).toEqual(unknownEvidence);
}

describe("D1: scoped gateway subtotal through the shared observer", () => {
  it.each(["0", "0.00454050000000000001"])("retains exact reported %s with scope", async (cost) => {
    const body = fixture();
    body.choices[0].message.provider_metadata.gateway.cost = cost;
    const result = await generate(body);
    const money = {
      amount: cost,
      currency: "USD",
      certainty: "reported",
      basis: "provider_response",
      rateCardVersion: null,
    };
    expect(result.providerCost).toEqual(money);
    expect(result.costEvidence).toEqual({
      providerReported: { money, scope: subtotalScope },
      upstreamInference: null,
      localEstimate: null,
    });
    expect(result.state).toBe("completed");
  });

  it.each(["byok", undefined, "future-credential"])(
    "never reports a subtotal with successful credential %s",
    async (credentialType) => {
      const body = fixture();
      const gateway = body.choices[0].message.provider_metadata.gateway;
      gateway.cost = "0";
      Object.assign(gateway.routing.modelAttempts[0].providerAttempts[0], { credentialType });
      expectUnknown(await generate(body));
    },
  );

  it.each(["byok", undefined, "future-credential"])(
    "never reports mixed successful credentials including %s",
    async (credentialType) => {
      const body = fixture();
      const attempts =
        body.choices[0].message.provider_metadata.gateway.routing.modelAttempts[0].providerAttempts;
      attempts.push({ ...attempts[0] });
      Object.assign(attempts[1], { credentialType });
      expectUnknown(await generate(body));
    },
  );

  it("retains only the system subtotal after a failed own-key attempt", async () => {
    const body = fixture();
    const gateway = body.choices[0].message.provider_metadata.gateway;
    gateway.routing.modelAttempts[0].providerAttempts.unshift({
      provider: "anthropic",
      success: false,
      credentialType: "byok",
    });
    const result = await generate(body);
    expect(result.costEvidence?.providerReported).toEqual({
      money: result.providerCost,
      scope: subtotalScope,
    });
    expect(result.costEvidence?.upstreamInference).toBeNull();
    expect(result.state).toBe("completed");
  });
});

describe("D2: contradictory routing never reports money", () => {
  it.each(["different provider", "missing provider", "unsafe final provider"])(
    "marks a successful attempt with %s invalid",
    async (variant) => {
      const body = fixture();
      const routing = body.choices[0].message.provider_metadata.gateway.routing;
      if (variant === "different provider")
        routing.modelAttempts[0].providerAttempts[0].provider = "anthropic";
      if (variant === "missing provider")
        Object.assign(routing.modelAttempts[0].providerAttempts[0], { provider: undefined });
      if (variant === "unsafe final provider") routing.finalProvider = key;
      const result = await generate(body);
      expectUnknown(result);
      expect(result).toMatchObject({
        state: "partial",
        failure: "invalid_response",
        actualProviderId: variant.includes("final provider") ? null : "bedrock",
        answer: routed.choices[0].message.content,
        usage: { inputTokens: 100, outputTokens: 40 },
      });
    },
  );
});

describe("D3: inconsistent or absent attempt success stays unknown", () => {
  it("rejects a successful model whose provider attempts all failed", async () => {
    const body = fixture();
    body.choices[0].message.provider_metadata.gateway.routing.modelAttempts[0].providerAttempts[0].success = false;
    expectUnknown(await generate(body));
  });

  it("rejects a provider attempt without a success field", async () => {
    const body = fixture();
    const attempts = body.choices[0].message.provider_metadata.gateway.routing.modelAttempts;
    Object.assign(attempts[0], {
      providerAttempts: [{ provider: "bedrock", credentialType: "system" }],
    });
    expectUnknown(await generate(body));
  });
});

describe("D4: money negatives retain valid system routing", () => {
  it.each([
    { cost: 0.0045 },
    { cost: undefined, marketCost: "0.0045" },
    { cost: undefined, totalCost: "0.0045" },
  ])("ignores unsupported money representation %j", async (money) => {
    const body = fixture();
    Object.assign(body.choices[0].message.provider_metadata.gateway, money);
    expectUnknown(await generate(body));
  });
});

describe("D6: citation titles preserve valid Unicode only", () => {
  it.each(["\ud800", "\udfff", `${"x".repeat(600)}\ud800`])(
    "discards a malformed title, including beyond the retained limit: %#",
    async (title) => {
      const body = fixture();
      Object.assign(body.choices[0].message, {
        annotations: [
          {
            type: "url_citation",
            url_citation: {
              url: "https://example.org/source",
              title,
              start_index: 0,
              end_index: 1,
            },
          },
        ],
      });
      const result = await generate(body);
      expect(result).toMatchObject({
        state: "partial",
        failure: null,
        answer: routed.choices[0].message.content,
        truncation: { citations: true },
        citations: [{ title: null, start: 0, end: 1 }],
      });
      expect(result.costEvidence?.providerReported?.money).toEqual(result.providerCost);
      expect(result.usage.inputTokens).toBe(100);
    },
  );

  it("retains a valid surrogate pair in a citation title", async () => {
    const body = fixture();
    Object.assign(body.choices[0].message, {
      annotations: [
        { type: "url_citation", url_citation: { url: "https://example.org/source", title: "😀" } },
      ],
    });
    const result = await generate(body);
    expect(result.citations[0].title).toBe("😀");
    expect(result.state).toBe("completed");
    expect(result.truncation.citations).toBe(false);
  });
});
