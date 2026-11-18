import { modelCatalogSnapshotSchema } from "@/lib/model-playground/schema";
import { modelColumnResultSchema } from "@/lib/model-playground/types";
import { ModelTransportError } from "@/lib/providers/model/errors";
import { transportEvidence } from "@/lib/providers/model/transport-evidence";
import type { ModelGenerationInput } from "@/lib/providers/model/transport-input";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import catalog from "./__fixtures__/catalog.json";
import routed from "./__fixtures__/routed.json";
import text from "./__fixtures__/text.json";
import { vercelAiGatewayProvider as adapter } from "./adapter";
import { context, key, observer, request } from "./adapter.test-support";
import { normalizeCatalog, textModelId } from "./catalog";

const mocks = vi.hoisted(() => ({ read: vi.fn(), generate: vi.fn() }));
vi.mock("@/lib/providers/model/transport", () => ({
  readModelMetadata: mocks.read,
  generateModelResponse: mocks.generate,
}));
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Unexpected network");
    }),
  );
  mocks.read.mockReset();
  mocks.generate.mockReset();
  mocks.generate.mockImplementation(async (config: ModelGenerationInput) =>
    modelColumnResultSchema.parse({
      ...transportEvidence(config.column, Date.now(), null),
      ...config.normalize({ body: routed, requestId: null }),
    }),
  );
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe("explicit metadata probe", () => {
  it("intersects exact fixture-backed models and never treats catalog access as generation", async () => {
    mocks.read.mockResolvedValue({ body: catalog, requestId: null });
    const credentials = context();
    const result = await adapter.probe(credentials);
    expect(result.state).toBe("catalog_available");
    expect(modelCatalogSnapshotSchema.safeParse(result.catalog).success).toBe(true);
    expect(result.catalog?.models).toHaveLength(1);
    expect(result.catalog?.models[0]).toMatchObject({
      modelId: textModelId,
      search: [],
      temperature: false,
    });
    expect(mocks.read).toHaveBeenCalledExactlyOnceWith({
      providerId: adapter.id,
      context: credentials,
    });
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(key);
  });

  it.each(["image", "embedding", "video"])("excludes a curated ID reported as %s", (type) => {
    const body = structuredClone(catalog);
    body.data[0].type = type;
    expect(normalizeCatalog(body, context().accountDigest).models).toEqual([]);
  });

  it("excludes unsupported output, eligibility and output bounds", () => {
    for (const fields of [
      { modalities: { input: ["text"], output: ["image"] } },
      { model_eligibility: { status: "unknown" } },
      { model_eligibility: { status: "ineligible" } },
      { max_tokens: 15 },
      { max_tokens: "4096" },
    ]) {
      expect(
        normalizeCatalog(
          { object: "list", data: [{ id: textModelId, ...fields }] },
          context().accountDigest,
        ).models,
      ).toEqual([]);
    }
  });

  it("accepts documented minimal rows but rejects duplicates and pagination", () => {
    const body = { object: "list", data: [{ id: textModelId }] };
    expect(normalizeCatalog(body, context().accountDigest).models).toHaveLength(1);
    expect(
      normalizeCatalog(
        { ...body, data: [{ id: textModelId, max_tokens: 64 }] },
        context().accountDigest,
      ).models[0].maxOutputTokens,
    ).toBe(64);
    for (const invalid of [
      { ...body, has_more: true },
      { ...body, data: [...body.data, ...body.data] },
      { error: key },
      null,
    ])
      expect(() => normalizeCatalog(invalid, context().accountDigest)).toThrow();
  });

  it.each([
    ["invalid_credentials", "invalid_key"],
    ["refused", "unavailable"],
    ["rate_limited", "unavailable"],
    ["provider_error", "unavailable"],
  ] as const)("classifies %s safely", async (code, state) => {
    mocks.read.mockRejectedValue(new ModelTransportError(code));
    expect(await adapter.probe(context())).toEqual({ state, catalog: null });
  });

  it("distinguishes no supported models from malformed metadata", async () => {
    mocks.read.mockResolvedValueOnce({ body: { object: "list", data: [] } });
    expect(await adapter.probe(context())).toEqual({ state: "no_supported_models", catalog: null });
    mocks.read.mockResolvedValueOnce({ body: { error: key } });
    expect(await adapter.probe(context())).toEqual({ state: "unavailable", catalog: null });
  });
});

describe("bounded native generation", () => {
  it("uses only P04 with exact identity, no retries or extra catalog read", async () => {
    const input = request();
    const meter = observer();
    const result = await adapter.generate(context(), input, meter);
    expect(result).toMatchObject({
      column: input.column,
      actualModelId: textModelId,
      actualProviderId: "bedrock",
      state: "completed",
    });
    expect(result.providerCost).toMatchObject({
      amount: "0.00454050000000000001",
      certainty: "reported",
      basis: "provider_response",
    });
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    const config = mocks.generate.mock.calls[0][0];
    expect(config.observer).toBe(meter);
    expect(config.body).toEqual({
      model: textModelId,
      messages: [
        { role: "system", content: "Respond in language pl." },
        { role: "user", content: input.prompt },
      ],
      max_tokens: 128,
      stream: false,
    });
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("retains unreported routing as null", async () => {
    mocks.generate.mockImplementationOnce(async (config: ModelGenerationInput) =>
      config.normalize({ body: text, requestId: null }),
    );
    expect(await adapter.generate(context(), request(), observer())).toMatchObject({
      actualModelId: textModelId,
      actualProviderId: null,
    });
  });

  it.each([
    { settings: { maxOutputTokens: 128, search: { mode: "gateway_perplexity_search" } } },
    {
      settings: {
        maxOutputTokens: 128,
        search: { mode: "gateway_perplexity_search", countryCode: "PL" },
      },
    },
    {
      settings: {
        maxOutputTokens: 128,
        search: { mode: "gateway_perplexity_search", maxCalls: 1 },
      },
    },
    { settings: { maxOutputTokens: 128, search: { mode: "openai_web_search" } } },
    { settings: { maxOutputTokens: 128, search: { mode: "off", countryCode: "PL" } } },
    { settings: { maxOutputTokens: 128, search: { mode: "off" }, temperature: 1 } },
    { settings: { maxOutputTokens: 4097, search: { mode: "off" } } },
    { settings: { maxOutputTokens: 128, search: { mode: "off" }, tools: [] } },
    { modelId: "unverified/text-model" },
    { modelId: "vmc/custom" },
    { providerId: "openrouter" },
  ])("rejects unsupported controls before observer admission: %j", async (fields) => {
    const input = request();
    const meter = observer();
    await expect(
      adapter.generate(
        context(),
        { ...input, column: { ...input.column, ...fields } } as typeof input,
        meter,
      ),
    ).rejects.toMatchObject({ code: "invalid_request", dispatched: false });
    expect(meter.beforeDispatch).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("rejects top-level overrides and poisoned input without echoing it", async () => {
    for (const fields of [
      { baseUrl: "https://example.com" },
      { prompt: "x".repeat(501) },
      { responseLanguage: key },
    ]) {
      await expect(
        adapter.generate(context(), { ...request(), ...fields }, observer()),
      ).rejects.toMatchObject({
        code: "invalid_request",
        message: "Model request is not allowed.",
      });
    }
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("propagates a dispatched failure without a paid retry", async () => {
    mocks.generate.mockRejectedValue(new ModelTransportError("timeout", true));
    await expect(adapter.generate(context(), request(), observer())).rejects.toMatchObject({
      code: "timeout",
      dispatched: true,
    });
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
