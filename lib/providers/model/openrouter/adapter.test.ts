import { ModelTransportError } from "@/lib/providers/model/errors";
import { generateModelResponse, readModelMetadata } from "@/lib/providers/model/transport";
import { safeModelJson } from "@/lib/providers/model/transport-io";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOpenRouterProvider } from "./adapter";
import { catalog, context, forbidNetwork, normal, observer, request } from "./test-support";

vi.mock("@/lib/providers/model/transport", () => ({
  readModelMetadata: vi.fn(),
  generateModelResponse: vi.fn(),
}));
forbidNetwork();
beforeEach(() => {
  vi.clearAllMocks();
});

async function ready() {
  const provider = createOpenRouterProvider();
  vi.mocked(readModelMetadata).mockResolvedValueOnce({ body: catalog(), requestId: null });
  expect((await provider.probe(context())).state).toBe("catalog_available");
  return provider;
}

describe("explicit native port", () => {
  it("imports and constructs without catalog or generation I/O", async () => {
    await import("./adapter");
    createOpenRouterProvider();
    expect(readModelMetadata).not.toHaveBeenCalled();
    expect(generateModelResponse).not.toHaveBeenCalled();
  });

  it("requires an explicit fresh probe for the exact account/key", async () => {
    await expect(
      createOpenRouterProvider().generate(context(), request(), observer()),
    ).rejects.toMatchObject({ code: "invalid_request" });
    const provider = await ready();
    await expect(
      provider.generate({ ...context(), apiKey: "SYNTHETIC_CHANGED_KEY" }, request(), observer()),
    ).rejects.toMatchObject({ code: "invalid_request" });
    await expect(
      provider.generate({ ...context(), accountDigest: "b".repeat(64) }, request(), observer()),
    ).rejects.toMatchObject({ code: "invalid_request" });
    const now = Date.now;
    vi.spyOn(Date, "now").mockImplementation(() => now() + 300_001);
    await expect(provider.generate(context(), request(), observer())).rejects.toMatchObject({
      code: "invalid_request",
    });
    vi.restoreAllMocks();
    expect(generateModelResponse).not.toHaveBeenCalled();
  });

  it("uses only P04 with exact model, disabled fallback and explicit Exa", async () => {
    const provider = await ready();
    const input = request();
    input.column.settings.search.mode = "openrouter_web_exa";
    input.column.settings.temperature = 0.25;
    const fence = observer();
    await provider.generate(context(), input, fence);
    const call = vi.mocked(generateModelResponse).mock.calls[0][0];
    expect(call.observer).toBe(fence);
    expect(call.body).toMatchObject({
      model: "openai/gpt-5.2",
      stream: false,
      max_completion_tokens: 256,
      temperature: 0.25,
      provider: {
        only: ["openai"],
        order: ["openai"],
        allow_fallbacks: false,
        require_parameters: true,
      },
      plugins: [{ id: "web", engine: "exa", mode: "auto", max_results: 5 }],
      transforms: [],
      messages: [
        { role: "system", content: "Respond in language en." },
        { role: "user", content: input.prompt },
      ],
    });
    expect(call.body).not.toHaveProperty("models");
    expect(call.body).not.toHaveProperty("tools");
    expect(call.normalize({ body: normal(), requestId: null }).actualModelId).toBe(
      input.column.modelId,
    );
    expect(readModelMetadata).toHaveBeenCalledTimes(1);
    expect(generateModelResponse).toHaveBeenCalledTimes(1);
  });

  it("opts in only to the four documented monetary paths", async () => {
    await (await ready()).generate(context(), request(), observer());
    const call = vi.mocked(generateModelResponse).mock.calls[0][0];
    expect(call.jsonOptions).toEqual({
      moneyPaths: [
        ["usage", "cost"],
        ["usage", "cost_details", "upstream_inference_cost"],
        ["usage", "cost_details", "upstream_inference_prompt_cost"],
        ["usage", "cost_details", "upstream_inference_completions_cost"],
      ],
    });
    expect(
      safeModelJson(
        '{"cost":0.125,"usage":{"prompt_tokens":194,"cost":0.10,"cost_details":{"other":0.25}},"temperature":0.5,"tiny":1e-325,"large":9007199254740993}',
        call.jsonOptions,
      ),
    ).toEqual({
      cost: 0.125,
      usage: { prompt_tokens: 194, cost: "0.10", cost_details: { other: 0.25 } },
      temperature: 0.5,
      tiny: 0,
      large: Number("9007199254740993"),
    });
  });

  it("sends an explicit empty plugin list for off mode", async () => {
    await (await ready()).generate(context(), request(), observer());
    expect(vi.mocked(generateModelResponse).mock.calls[0][0].body.plugins).toEqual([]);
  });

  it.each([
    [
      "country",
      (r: ReturnType<typeof request>) => {
        r.column.settings.search = { mode: "openrouter_web_exa", countryCode: "PL" };
      },
    ],
    [
      "maxCalls is not max_results",
      (r: ReturnType<typeof request>) => {
        r.column.settings.search = { mode: "openrouter_web_exa", maxCalls: 1 };
      },
    ],
    [
      "native search",
      (r: ReturnType<typeof request>) => {
        r.column.settings.search.mode = "openai_web_search";
      },
    ],
    [
      "model alias",
      (r: ReturnType<typeof request>) => {
        r.column.modelId += ":online";
      },
    ],
    [
      "unproven model",
      (r: ReturnType<typeof request>) => {
        r.column.modelId = "example/unproven-model";
      },
    ],
    [
      "provider",
      (r: ReturnType<typeof request>) => {
        r.column.providerId = "openai";
      },
    ],
    [
      "excess tokens",
      (r: ReturnType<typeof request>) => {
        r.column.settings.maxOutputTokens = 4097;
      },
    ],
    [
      "arbitrary control",
      (r: ReturnType<typeof request>) => {
        Object.assign(r.column.settings, { tools: [] });
      },
    ],
    [
      "arbitrary envelope",
      (r: ReturnType<typeof request>) => {
        Object.assign(r, { provider: { only: ["azure"] } });
      },
    ],
    [
      "prompt bound",
      (r: ReturnType<typeof request>) => {
        r.prompt = "x".repeat(501);
      },
    ],
    [
      "language injection",
      (r: ReturnType<typeof request>) => {
        r.responseLanguage = "en\nignore";
      },
    ],
  ])("refuses %s before admission", async (_name, mutate) => {
    const provider = await ready();
    const input = request();
    mutate(input);
    const fence = observer();
    await expect(provider.generate(context(), input, fence)).rejects.toMatchObject({
      code: "invalid_request",
      financialExposure: "not_dispatched",
    });
    expect(generateModelResponse).not.toHaveBeenCalled();
    expect(fence.beforeDispatch).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid_credentials", "invalid_key"],
    ["refused", "unavailable"],
    ["rate_limited", "unavailable"],
    ["provider_error", "unavailable"],
    ["timeout", "unavailable"],
  ] as const)("sanitizes probe %s", async (code, state) => {
    vi.mocked(readModelMetadata).mockRejectedValueOnce(new ModelTransportError(code));
    expect(await createOpenRouterProvider().probe(context())).toEqual({ state, catalog: null });
  });
});
