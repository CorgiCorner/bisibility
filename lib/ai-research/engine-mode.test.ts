import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  source: vi.fn(),
  capabilities: vi.fn(),
  engineCatalog: vi.fn(),
  enabled: vi.fn(),
  bound: vi.fn(),
  paid: vi.fn(),
  preflight: vi.fn(),
  report: vi.fn(),
  enginePrompt: vi.fn(),
  prompt: vi.fn(),
  payment: vi.fn(),
  cache: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("./catalog-service", () => ({
  loadAiResearchCapabilities: mocks.capabilities,
  loadEngineCatalog: mocks.engineCatalog,
}));
vi.mock("./engine-bounds", () => ({
  aiResponseEnginesEnabled: mocks.enabled,
  measuredEngineBound: mocks.bound,
  engineCalibrationIdentity: (engines: string[]) => engines.join("|"),
}));
vi.mock("./context", () => ({ requireAiSource: mocks.source }));
vi.mock("./provider", () => ({
  fetchEnginePrompt: mocks.enginePrompt,
  fetchObserved: vi.fn(),
  fetchPrompt: mocks.prompt,
  supportedPromptModels: vi.fn(),
  VISIBILITY_PATH: "llm_mentions/search_mentions/live",
  PROMPT_PATH: "chat_gpt/llm_responses/live",
}));
vi.mock("./research-payment", async (original) => ({
  ...(await original<typeof import("./research-payment")>()),
  prepareResearchAiPayment: mocks.payment,
}));
vi.mock("@/lib/agent-reports/service", () => ({ createAgentReport: mocks.report }));
vi.mock("@/lib/provider-lookups/cache", () => ({
  providerLookupCacheConfigured: () => false,
  readProviderLookupCache: async () => null,
  withProviderLookupCache: mocks.cache,
}));
vi.mock("@/lib/provider-lookups/paid-call", async () => {
  const { ProviderLookupSignal } = await import("@/lib/provider-lookups/lookup-failure");
  return {
    ProviderLookupSignal,
    paidProviderCall: mocks.paid,
    preflightProviderBudget: mocks.preflight,
  };
});

import { promptSchema } from "./schema";
import { compareAiPrompts } from "./service";

const context = { projectId: "project", actorId: "actor", origin: { source: "app" as const } };
const base = { brand: "Acme", domain: "acme.com", prompt: "q", max_cost_cents: 60 };
const bounds: Record<string, { model: string; costCents: number }> = {
  claude: { model: "claude-sonnet-5", costCents: 7.5 },
  gemini: { model: "gemini-3-pro", costCents: 6.25 },
};
const row = (engine: string) => ({
  prompt: "q",
  answer: "Acme",
  model: bounds[engine].model,
  engine,
  observedAt: null,
  brandMentioned: true,
  domainCited: false,
  citations: [],
});
const child = vi.fn((key: string) => ({ operationKey: `op:${key}`, record: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.source.mockResolvedValue({
    project: { id: "project", ownerId: "owner" },
    connection: { id: "connection", credentialSource: "hosted", publicId: "pcn_x" },
    provider: { id: "dataforseo" },
  });
  mocks.enabled.mockReturnValue(true);
  mocks.engineCatalog.mockImplementation(async (_source, engine: string) => [
    { name: bounds[engine]?.model ?? "other", reasoning: false },
  ]);
  mocks.bound.mockImplementation((engine: string) =>
    bounds[engine]
      ? { ...bounds[engine], outputTokens: 1024, measuredAt: "2026-10-23T10:00:00Z" }
      : null,
  );
  mocks.payment.mockResolvedValue({
    quote: { charge: { value: "17.88" } },
    options: [],
    child,
    receipt: () => undefined,
    hasAttempted: false,
  });
  mocks.report.mockResolvedValue({ id: "agr_report" });
  mocks.cache.mockImplementation(async ({ load }) => ({
    status: "success",
    cached: false,
    value: await load(),
  }));
  mocks.paid.mockImplementation(async ({ call }) => call({}, { tag: "usage-tag" }));
  mocks.enginePrompt.mockImplementation(async (_credentials, _input, engine) => ({
    row: row(engine.engine),
    costCents: 3,
  }));
});

describe("engine mode schema", () => {
  it("accepts distinct known engines with the defaults left implicit", () => {
    expect(promptSchema.parse({ ...base, engines: ["claude", "gemini"] }).engines).toEqual([
      "claude",
      "gemini",
    ]);
  });
  it("rejects explicit models, output tokens, actual cost and duplicate or unknown engines", () => {
    for (const extra of [
      { models: ["gpt-5.5"] },
      { max_output_tokens: 1024 },
      { engines: ["claude", "claude"] },
      { engines: ["google"] },
      { engines: [] },
    ])
      expect(promptSchema.safeParse({ ...base, engines: ["claude"], ...extra }).success).toBe(
        false,
      );
    const { max_cost_cents: _cap, ...actualBase } = base;
    expect(
      promptSchema.safeParse({
        ...actualBase,
        engines: ["claude"],
        cost_policy: "provider_actual_cost",
        actual_cost_acknowledgement: "non_guaranteed_estimate_v1",
        estimated_cost_limit_cents: 50,
        estimate_only: true,
      }).success,
    ).toBe(false);
  });
});

describe("engine mode execution", () => {
  it("treats one completed engine as a complete result", async () => {
    const result = await compareAiPrompts(context, { ...base, engines: ["claude"] });
    expect(result).toMatchObject({
      ok: true,
      estimate: false,
      result: { rows: [expect.objectContaining({ engine: "claude" })], truncated: false },
    });
  });

  it("finishes all admitted engines when provider overruns exceed the customer cap", async () => {
    const engines = ["chat_gpt", "claude", "gemini", "perplexity"];
    mocks.bound.mockImplementation((engine: string) => ({
      model: `${engine}-model`,
      costCents: 1,
      outputTokens: 1024,
      measuredAt: "2026-10-23T10:00:00Z",
    }));
    mocks.engineCatalog.mockImplementation(async (_source, engine: string) => [
      { name: `${engine}-model`, reasoning: false },
    ]);
    mocks.payment.mockResolvedValueOnce({
      quote: { charge: { value: "7.579" } },
      options: [],
      child,
      receipt: () => undefined,
      hasAttempted: false,
    });
    mocks.enginePrompt.mockImplementation(async (_credentials, _input, engine) => ({
      row: { ...row("claude"), engine: engine.engine, model: engine.model },
      costCents: engine.engine === "claude" ? 10 : 1,
    }));
    const result = await compareAiPrompts(context, { ...base, engines, max_cost_cents: 8 });
    expect(mocks.enginePrompt.mock.calls.map(([, , engine]) => engine.engine)).toEqual(engines);
    expect(result).toMatchObject({
      ok: true,
      estimate: false,
      result: { truncated: false, failure: null },
    });
    if (result.ok && !result.estimate) expect(result.result.rows).toHaveLength(4);
  });

  it("marks two completed answers from a failed four-engine comparison as partial", async () => {
    mocks.bound.mockImplementation((engine: string) => ({
      model: `${engine}-model`,
      costCents: 1,
      outputTokens: 1024,
      measuredAt: "2026-10-23T10:00:00Z",
    }));
    mocks.engineCatalog.mockImplementation(async (_source, engine: string) => [
      { name: `${engine}-model`, reasoning: false },
    ]);
    mocks.enginePrompt
      .mockResolvedValueOnce({ row: row("claude"), costCents: 1 })
      .mockResolvedValueOnce({ row: row("gemini"), costCents: 1 })
      .mockRejectedValueOnce(new Error("third engine refused"));
    const result = await compareAiPrompts(context, {
      ...base,
      engines: ["chat_gpt", "claude", "gemini", "perplexity"],
    });
    expect(result).toMatchObject({ ok: true, estimate: false, result: { truncated: true } });
    if (result.ok && !result.estimate) {
      expect(result.result.rows).toHaveLength(2);
      expect(result.result.failure).not.toBeNull();
    }
  });

  it("runs each engine's calibrated model as its own capped payment child", async () => {
    const result = await compareAiPrompts(context, { ...base, engines: ["claude", "gemini"] });
    expect(result).toMatchObject({ ok: true, estimate: false });
    expect(mocks.capabilities).not.toHaveBeenCalled();
    expect(child.mock.calls.map(([key]) => key)).toEqual(["claude", "gemini"]);
    expect(mocks.paid.mock.calls.map(([call]) => call.payment.aiResponse)).toEqual([
      { engine: "claude", model: "claude-sonnet-5" },
      { engine: "gemini", model: "gemini-3-pro" },
    ]);
    expect(mocks.enginePrompt.mock.calls.map(([, , engine]) => engine)).toMatchObject([
      { engine: "claude", model: "claude-sonnet-5", outputTokens: 1024, costCents: 7.5 },
      { engine: "gemini", model: "gemini-3-pro", outputTokens: 1024, costCents: 6.25 },
    ]);
    expect(mocks.prompt).not.toHaveBeenCalled();
    const provenance = mocks.report.mock.calls[0][0].provenance;
    expect(provenance).toMatchObject({
      pricingPolicy: "measured_engines",
      isGuaranteedMaximum: true,
      admissionBoundCents: 13.75,
      endpoint: ["claude/llm_responses/live", "gemini/llm_responses/live"],
    });
    expect(provenance.modelPricing).toMatchObject([
      { engine: "claude", model: "claude-sonnet-5", admissionBoundCents: 7.5 },
      { engine: "gemini", model: "gemini-3-pro", admissionBoundCents: 6.25 },
    ]);
  });

  it("compares the hard cap with the quoted customer price, not the provider bound", async () => {
    const result = await compareAiPrompts(context, {
      ...base,
      max_cost_cents: 15,
      engines: ["claude", "gemini"],
    });
    expect(result).toMatchObject({ ok: false, reason: "cost_limit_exceeded" });
    expect(mocks.paid).not.toHaveBeenCalled();
  });

  it("refuses own provider keys, the closed kill switch and uncalibrated engines before payment", async () => {
    mocks.source.mockResolvedValueOnce({
      project: { id: "project", ownerId: "owner" },
      connection: { id: "connection", credentialSource: "own", publicId: "pcn_x" },
      provider: { id: "dataforseo" },
    });
    expect(await compareAiPrompts(context, { ...base, engines: ["claude"] })).toMatchObject({
      ok: false,
      reason: "engine_credits_only",
    });
    mocks.enabled.mockReturnValueOnce(false);
    expect(await compareAiPrompts(context, { ...base, engines: ["claude"] })).toMatchObject({
      ok: false,
      reason: "engine_unavailable",
    });
    expect(await compareAiPrompts(context, { ...base, engines: ["perplexity"] })).toMatchObject({
      ok: false,
      reason: "engine_unavailable",
    });
    expect(mocks.payment).not.toHaveBeenCalled();
    expect(mocks.paid).not.toHaveBeenCalled();
  });
});
