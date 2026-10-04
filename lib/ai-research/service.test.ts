import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  source: vi.fn(),
  paid: vi.fn(),
  preflight: vi.fn(),
  report: vi.fn(),
  observed: vi.fn(),
  prompt: vi.fn(),
  models: vi.fn(),
  cache: vi.fn(),
}));
vi.mock("server-only", () => ({}));
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
import { analyzeAiVisibility, compareAiPrompts } from "./service";

const context = {
  projectId: "internal-project",
  actorId: "actor",
  origin: { source: "app" as const },
};
const input = { brand: "Acme", domain: "acme.com", max_cost_cents: 60 };
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
afterEach(() => vi.useRealTimers());
describe("AI research vertical contracts", () => {
  it("estimates without credentials or paid I/O", async () => {
    expect(await analyzeAiVisibility(context, { ...input, estimate_only: true })).toMatchObject({
      ok: true,
      estimate: true,
      estimatedCostCents: 11,
      evidence: "observed_dataset",
    });
    expect(mocks.paid).not.toHaveBeenCalled();
  });
  it("rejects a cost cap before provider I/O or persistence", async () => {
    expect(await analyzeAiVisibility(context, { ...input, max_cost_cents: 0 })).toMatchObject({
      ok: false,
      reason: "cost_limit_exceeded",
    });
    expect(mocks.paid).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
  });
  it("saves real observed evidence scoped to the project", async () => {
    const outcome = await analyzeAiVisibility(context, input);
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
      vi.advanceTimersByTime(40_001);
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
    expect(mocks.models).toHaveBeenCalledTimes(1);
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
    mocks.models.mockRejectedValueOnce(error);
    await expect(compareAiPrompts(context, { ...input, prompt: "q" })).rejects.toBe(error);
    expect(mocks.prompt).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
  });
  it("preserves the measured charge when a paid answer cannot be normalized", async () => {
    mocks.observed.mockImplementationOnce(async (...args) => {
      args[4]?.();
      throw new ProviderCallError("AI visibility response could not be normalized.", 10.3);
    });
    expect(await analyzeAiVisibility(context, input)).toMatchObject({
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
    expect(await analyzeAiVisibility(context, { ...input, max_cost_cents: 0 })).toMatchObject({
      ok: true,
      cached: true,
      costCents: 0,
      result: { costCents: 11 },
    });
    expect(mocks.paid).not.toHaveBeenCalled();
  });
});
