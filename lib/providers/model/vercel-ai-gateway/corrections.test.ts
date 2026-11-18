import { modelColumnResultSchema } from "@/lib/model-playground/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import routed from "./__fixtures__/routed.json";
import text from "./__fixtures__/text.json";
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

async function generate(body: unknown, prompt = request().prompt) {
  wire.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } }),
  );
  const meter = observer();
  const result = await adapter.generate(context(), { ...request(), prompt }, meter);
  expect(modelColumnResultSchema.safeParse(result).success).toBe(true);
  expect(wire).toHaveBeenCalledTimes(1);
  expect(meter.settle).toHaveBeenCalledExactlyOnceWith(request().operationKey, result);
  return result;
}

describe("C1: cache accounting requires route evidence", () => {
  it.each([
    ["text.json", text],
    ["routed.json", routed],
    [
      "additional-shaped input",
      {
        ...routed,
        usage: {
          prompt_tokens: 100,
          completion_tokens: 40,
          prompt_tokens_details: { cached_tokens: 20, cache_write_tokens: 5 },
        },
      },
    ],
  ])("keeps %s accounting unknown", async (_name, body) => {
    expect((await generate(body)).usage.inputCacheAccounting).toBe("unknown");
  });
});

describe("C2: cost requires verified gateway-billed attempts", () => {
  it.each(["byok", undefined, "future-credential"])(
    "keeps a zero with credential type %s unknown",
    async (credentialType) => {
      const body = structuredClone(routed);
      const gateway = body.choices[0].message.provider_metadata.gateway;
      gateway.cost = "0";
      Object.assign(gateway.routing.modelAttempts[0].providerAttempts[0], { credentialType });
      expect((await generate(body)).providerCost).toMatchObject({
        amount: null,
        certainty: "unknown",
        basis: "unknown",
      });
    },
  );

  it.each(["byok", undefined, "future-credential"])(
    "keeps mixed successful attempts with %s unknown",
    async (credentialType) => {
      const body = structuredClone(routed);
      const gateway = body.choices[0].message.provider_metadata.gateway;
      const attempts = gateway.routing.modelAttempts[0].providerAttempts;
      attempts.push({ ...attempts[0], credentialType } as (typeof attempts)[number]);
      expect((await generate(body)).providerCost).toMatchObject({
        amount: null,
        certainty: "unknown",
        basis: "unknown",
      });
    },
  );

  it.each([undefined, [], [{ success: true }], [{ success: true, providerAttempts: [] }]])(
    "does not infer billing from missing attempt evidence: %j",
    async (modelAttempts) => {
      const body = structuredClone(routed);
      Object.assign(body.choices[0].message.provider_metadata.gateway.routing, { modelAttempts });
      expect((await generate(body)).providerCost.amount).toBeNull();
    },
  );

  it("retains a system-billed zero after an explicitly failed own-key attempt", async () => {
    const body = structuredClone(routed);
    const gateway = body.choices[0].message.provider_metadata.gateway;
    gateway.cost = "0";
    const attempts = gateway.routing.modelAttempts[0].providerAttempts;
    attempts.unshift({ ...attempts[0], success: false, credentialType: "byok" });
    expect((await generate(body)).providerCost).toMatchObject({
      amount: "0",
      certainty: "reported",
      basis: "provider_response",
    });
  });
});

describe("C3: valid prompts do not redact response identity", () => {
  it.each(["claude", "sonnet", "e"])("retains routing for prompt %s", async (prompt) => {
    expect(await generate(routed, prompt)).toMatchObject({
      state: "completed",
      failure: null,
      actualModelId: routed.model,
      actualProviderId: "bedrock",
    });
  });
});

describe("C4: refusals retain evidence without answerless citations", () => {
  it("settles refusal, usage and cost when null content includes annotations", async () => {
    const body = structuredClone(routed);
    Object.assign(body.choices[0].message, {
      content: null,
      refusal: "Synthetic refusal",
      annotations: [{ type: "url_citation", url_citation: { url: "https://example.org/source" } }],
    });
    expect(await generate(body)).toMatchObject({
      state: "failed",
      failure: "refused",
      answer: null,
      citations: [],
      truncation: { citations: true },
      usage: { inputTokens: 100, outputTokens: 40 },
      providerCost: { amount: routed.choices[0].message.provider_metadata.gateway.cost },
    });
  });
});

describe("C7: serialized evidence excludes untrusted envelope fields", () => {
  it("does not retain key or prompt echoes in unknown fields", async () => {
    const echoes = [
      key,
      encodeURIComponent(key),
      Buffer.from(key).toString("base64"),
      request().prompt,
    ];
    const body = structuredClone(routed);
    Object.assign(body, { debug: echoes });
    Object.assign(body.choices[0].message, { debug: echoes });
    Object.assign(body.choices[0].message.provider_metadata.gateway, { debug: echoes });
    const serialized = JSON.stringify(await generate(body));
    for (const echo of echoes) expect(serialized).not.toContain(echo);
  });
});
