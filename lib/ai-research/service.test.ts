import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  source: vi.fn(),
  capabilities: vi.fn(),
  paid: vi.fn(),
  preflight: vi.fn(),
  report: vi.fn(),
  observed: vi.fn(),
  prompt: vi.fn(),
  models: vi.fn(),
  cache: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("./catalog-service", () => ({ loadAiResearchCapabilities: mocks.capabilities }));
vi.mock("./context", () => ({ requireAiSource: mocks.source }));
vi.mock("./provider", () => ({
  fetchObserved: mocks.observed,
  fetchPrompt: mocks.prompt,
  supportedPromptModels: mocks.models,
  VISIBILITY_PATH: "llm_mentions/search_mentions/live",
  PROMPT_PATH: "chat_gpt/llm_responses/live",
}));
vi.mock("@/lib/agent-reports/service", () => ({ createAgentReport: mocks.report }));
vi.mock("@/lib/provider-lookups/cache", () => ({ withProviderLookupCache: mocks.cache }));
vi.mock("@/lib/provider-lookups/paid-call", async () => {
  const { ProviderLookupSignal } = await import("@/lib/provider-lookups/lookup-failure");
  return {
    ProviderLookupSignal,
    paidProviderCall: mocks.paid,
    preflightProviderBudget: mocks.preflight,
  };
});

import { OperationAccessDeniedError } from "@/lib/operations/access-error";
import { ProviderLookupSignal } from "@/lib/provider-lookups/lookup-failure";
import { ProviderCallError } from "@/lib/providers/call-error";
import { DeploymentAdmissionExhaustedError } from "@/lib/providers/execution-extension-errors";
import { capabilities } from "./catalog-fixtures.test-support";
import { AI_REQUEST_BUDGET_MS } from "./deadline";
import { analyzeAiVisibility, compareAiPrompts } from "./service";

const context = {
  projectId: "internal-project",
  actorId: "actor",
  origin: { source: "app" as const },
};
const input = {
  brand: "Acme",
  domain: "acme.com",
  max_cost_cents: 60,
  models: ["gpt-4.1-mini", "gpt-4.1-nano"],
};
const { models: _models, ...visibilityInput } = input;
const row = {
  prompt: "q",
  answer: "Acme",
  model: "gpt-4.1-mini",
  observedAt: null,
  brandMentioned: true,
  domainCited: false,
  citations: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.source.mockResolvedValue({
    project: { id: context.projectId, budgetCapCents: 100 },
    connection: { id: "connection", provider: "dataforseo" },
    provider: { id: "dataforseo" },
  });
  mocks.capabilities.mockResolvedValue(capabilities);
  mocks.models.mockResolvedValue(new Set(["gpt-4.1-mini", "gpt-4.1-nano"]));
  mocks.report.mockResolvedValue({ id: "agr_report" });
  mocks.cache.mockImplementation(async ({ load }) => ({
    status: "success",
    cached: false,
    value: await load(),
  }));
  mocks.paid.mockImplementation(async ({ call }) => call({}, { tag: "usage-tag" }));
  mocks.observed.mockImplementation(async (...args) => {
    args[4]?.();
    return { rows: [row], costCents: 10.1, totalAvailable: 5 };
  });
  mocks.prompt.mockImplementation(async (...args) => {
    args[6]?.();
    return { row, costCents: 0.1 };
  });
});

it("retains internal scheduled attribution and distinct request correlations", async () => {
  await compareAiPrompts(
    {
      ...context,
      origin: { source: "worker" },
      execution: { trigger: "scheduled", correlationId: "tracking-attempt" },
    },
    { ...input, prompt: "q" },
  );
  expect(
    mocks.paid.mock.calls.map(([call]) => [call.source, call.trigger, call.correlationId]),
  ).toEqual([
    ["worker", "scheduled", "tracking-attempt:0"],
    ["worker", "scheduled", "tracking-attempt:1"],
  ]);
});
afterEach(() => vi.useRealTimers());
describe("AI research vertical contracts", () => {
  it("preserves legacy omitted-model requests without new metadata admission", async () => {
    mocks.capabilities.mockRejectedValue(new Error("new catalog outage"));
    const legacy = { ...visibilityInput, prompt: "q", estimate_only: true };
    expect(await compareAiPrompts(context, legacy)).toMatchObject({
      ok: true,
      estimate: true,
      estimatedCostCents: 52.6013,
    });
    expect(await compareAiPrompts(context, { ...legacy, estimate_only: false })).toMatchObject({
      ok: true,
      estimate: false,
    });
    expect(mocks.capabilities).not.toHaveBeenCalled();
    expect(mocks.models).toHaveBeenCalledTimes(1);
    expect(mocks.prompt).toHaveBeenCalledTimes(2);
    for (const call of mocks.prompt.mock.calls)
      expect(call[1]).toMatchObject({
        models: ["gpt-4.1-mini", "gpt-4.1-nano"],
        max_output_tokens: 512,
      });
  });
  it("blocks unknown complete model prices before paid admission or report writes", async () => {
    mocks.capabilities.mockResolvedValue({ ...capabilities, modelRates: new Map() });
    for (const estimate_only of [true, false])
      expect(
        await compareAiPrompts(context, {
          ...input,
          prompt: "q",
          max_output_tokens: 4096,
          estimate_only,
        }),
      ).toMatchObject({ ok: false, reason: "pricing_unavailable" });
    expect(mocks.paid).not.toHaveBeenCalled();
    expect(mocks.preflight).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
  });
  it("blocks unpriced search even when ordinary token rates exist", async () => {
    expect(
      await compareAiPrompts(context, {
        ...input,
        prompt: "q",
        web_search: true,
        country_iso_code: "US",
      }),
    ).toMatchObject({ ok: false, reason: "web_search_not_enabled" });
    expect(mocks.paid).not.toHaveBeenCalled();
  });
  it("rejects unsupported observed market combinations before paid I/O", async () => {
    expect(
      await analyzeAiVisibility(context, {
        ...visibilityInput,
        location_code: 2616,
        language_code: "pl",
      }),
    ).toMatchObject({ ok: false, reason: "unsupported_market" });
    expect(mocks.paid).not.toHaveBeenCalled();
  });
  it("does not convert unknown visibility row prices into a free estimate", async () => {
    mocks.capabilities.mockResolvedValue({ ...capabilities, visibilityPricing: null });
    expect(
      await analyzeAiVisibility(context, {
        ...visibilityInput,
        platform: "google",
        location_code: 2616,
        language_code: "pl",
        estimate_only: true,
      }),
    ).toMatchObject({ ok: false, reason: "pricing_unavailable" });
    expect(mocks.paid).not.toHaveBeenCalled();
  });

  it("estimates without credentials or paid I/O", async () => {
    expect(
      await analyzeAiVisibility(context, { ...visibilityInput, estimate_only: true }),
    ).toMatchObject({
      ok: true,
      estimate: true,
      estimatedCostCents: 11,
      evidence: "observed_dataset",
    });
    expect(mocks.paid).not.toHaveBeenCalled();
  });
  it("rejects a cost cap before provider I/O or persistence", async () => {
    expect(
      await analyzeAiVisibility(context, { ...visibilityInput, max_cost_cents: 0 }),
    ).toMatchObject({
      ok: false,
      reason: "cost_limit_exceeded",
    });
    expect(mocks.paid).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
  });
  it("saves real observed evidence scoped to the project", async () => {
    const outcome = await analyzeAiVisibility(context, visibilityInput);
    expect(outcome).toMatchObject({
      ok: true,
      reportId: "agr_report",
      result: { evidence: "observed_dataset", costCents: 10.1, truncated: true },
    });
    expect(mocks.report).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: context.projectId,
        kind: "ai_visibility",
        provenance: expect.objectContaining({ evidence: "observed_dataset" }),
      }),
    );
  });
  it("sends the same prompt to selected models and preserves charged partial failures", async () => {
    mocks.prompt
      .mockResolvedValueOnce({ row, costCents: 0.1 })
      .mockImplementationOnce(async (...args) => {
        args[6]?.();
        throw new ProviderCallError("failure", 0.2);
      });
    const outcome = await compareAiPrompts(context, { ...input, prompt: "same prompt" });
    expect(outcome).toMatchObject({
      ok: true,
      result: {
        costCents: expect.closeTo(0.3, 6),
        costStatus: "confirmed",
        rows: [row],
        evidence: "synthetic_prompt_test",
        truncated: true,
      },
    });
    expect(mocks.prompt.mock.calls.map((call) => call[1].prompt)).toEqual([
      "same prompt",
      "same prompt",
    ]);
  });
  it("does not label ambiguous acceptance as zero usage", async () => {
    mocks.prompt.mockImplementationOnce(async (...args) => {
      args[6]?.();
      throw new Error("network lost");
    });
    expect(await compareAiPrompts(context, { ...input, prompt: "q" })).toMatchObject({
      ok: true,
      result: { costStatus: "unknown", rows: [] },
    });
    expect(mocks.prompt).toHaveBeenCalledTimes(1);
  });
  it("stops before the next paid model when the aggregate deadline expires", async () => {
    vi.useFakeTimers();
    mocks.prompt.mockImplementationOnce(async () => {
      vi.advanceTimersByTime(AI_REQUEST_BUDGET_MS + 1);
      return { row, costCents: 0.1 };
    });
    const outcome = await compareAiPrompts(context, { ...input, prompt: "q" });
    expect(outcome).toMatchObject({
      ok: true,
      result: {
        rows: [row],
        costCents: 0.1,
        costStatus: "confirmed",
        failure: expect.stringContaining("deadline"),
      },
    });
    expect(mocks.paid).toHaveBeenCalledTimes(1);
    expect(mocks.capabilities).not.toHaveBeenCalled();
  });
  it.each([
    new DeploymentAdmissionExhaustedError("balance"),
    new DeploymentAdmissionExhaustedError("budget"),
    new OperationAccessDeniedError(),
    new ProviderLookupSignal({ ok: false, reason: "rate_limited" }),
    new ProviderLookupSignal({ ok: false, reason: "needs_reauth" }),
  ])("does not save or cache a pre-dispatch refusal: %s", async (error) => {
    mocks.paid.mockRejectedValueOnce(error);
    const pending = compareAiPrompts(context, { ...input, prompt: "q" });
    if (error instanceof ProviderLookupSignal)
      expect(await pending).toMatchObject({ ok: false, reason: error.outcome.reason });
    else await expect(pending).rejects.toBe(error);
    expect(mocks.prompt).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
    // Cache load throws; no successful value can be written by the real cache.
    await expect(mocks.cache.mock.results[0].value).rejects.toBe(error);
  });
  it("preserves partial answers and confirmed cost on a later credit refusal", async () => {
    mocks.paid
      .mockImplementationOnce(async ({ call }) => call({}, { tag: "usage-tag" }))
      .mockRejectedValueOnce(new DeploymentAdmissionExhaustedError("balance"));
    expect(await compareAiPrompts(context, { ...input, prompt: "q" })).toMatchObject({
      ok: true,
      result: {
        rows: [row],
        costCents: 0.1,
        costStatus: "confirmed",
        failure: expect.stringContaining("credits_exhausted"),
      },
    });
    expect(mocks.prompt).toHaveBeenCalledTimes(1);
    expect(mocks.report).toHaveBeenCalledTimes(1);
  });
  it("does not make a failed free capability read a sticky paid failure", async () => {
    const error = new Error("free metadata unavailable");
    mocks.capabilities.mockRejectedValueOnce(error);
    expect(
      await compareAiPrompts(context, { ...input, prompt: "q", max_output_tokens: 4096 }),
    ).toMatchObject({ ok: false, reason: "pricing_unavailable" });
    expect(mocks.prompt).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
  });
  it("preserves the measured charge when a paid answer cannot be normalized", async () => {
    mocks.observed.mockImplementationOnce(async (...args) => {
      args[4]?.();
      throw new ProviderCallError("AI visibility response could not be normalized.", 10.3);
    });
    expect(await analyzeAiVisibility(context, visibilityInput)).toMatchObject({
      ok: true,
      result: { rows: [], costCents: 10.3, costStatus: "confirmed" },
    });
  });
  it("serves cached results without another paid call", async () => {
    mocks.cache.mockResolvedValue({
      status: "success",
      cached: true,
      value: {
        reportId: "agr_cached",
        result: { evidence: "observed_dataset", costCents: 11, rows: [] },
      },
    });
    expect(
      await analyzeAiVisibility(context, { ...visibilityInput, max_cost_cents: 0 }),
    ).toMatchObject({
      ok: true,
      cached: true,
      costCents: 0,
      result: { costCents: 11 },
    });
    expect(mocks.paid).not.toHaveBeenCalled();
  });
});
