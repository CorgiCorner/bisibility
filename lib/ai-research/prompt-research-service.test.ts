import { beforeEach, expect, it, vi } from "vitest";
import type { ResearchAiPayment } from "./research-payment";

const mocks = vi.hoisted(() => ({
  source: vi.fn(),
  capabilities: vi.fn(),
  paid: vi.fn(),
  preflight: vi.fn(),
  report: vi.fn(),
  questions: vi.fn(),
  cache: vi.fn(),
  payment: vi.fn(),
  index: vi.fn(),
}));
vi.mock("./context", () => ({ requireAiSource: mocks.source }));
vi.mock("./catalog-service", () => ({ loadAiResearchCapabilities: mocks.capabilities }));
vi.mock("./prompt-research-provider", () => ({ fetchResearchQuestions: mocks.questions }));
vi.mock("./research-payment", async (original) => ({
  ...(await original<typeof import("./research-payment")>()),
  prepareResearchAiPayment: mocks.payment,
}));
vi.mock("@/lib/agent-reports/service", () => ({ createAgentReport: mocks.report }));
vi.mock("@/lib/provider-lookups/cache", () => ({
  providerLookupCacheConfigured: () => true,
  readProviderLookupCache: async () => null,
  writeProviderLookupCache: mocks.index,
  withProviderLookupCache: mocks.cache,
}));
vi.mock("@/lib/provider-lookups/paid-call", async () => ({
  ProviderLookupSignal: (await import("@/lib/provider-lookups/lookup-failure"))
    .ProviderLookupSignal,
  paidProviderCall: mocks.paid,
  preflightProviderBudget: mocks.preflight,
}));

import { capabilities } from "./catalog-fixtures.test-support";
import { researchAiQuestions } from "./service";

const context = { projectId: "project", actorId: "actor", origin: { source: "app" as const } };
const input = { keyword: "tools", max_cost_cents: 50 };
const result = {
  rows: [],
  costCents: 12.5,
  totalAvailable: 0,
  providerRequestId: "native-request",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.source.mockResolvedValue({
    project: { id: "project", ownerId: "owner", lookupCacheTtlSeconds: 60 },
    connection: { id: "connection", provider: "dataforseo", credentialSource: "own" },
    provider: { id: "dataforseo" },
  });
  mocks.capabilities.mockResolvedValue(capabilities);
  mocks.report.mockResolvedValue({ id: "agr_report" });
  mocks.cache.mockImplementation(async ({ load }) => ({
    status: "success",
    cached: false,
    value: await load(),
  }));
  mocks.questions.mockImplementation(async (...args) => {
    args[4]?.();
    return result;
  });
  mocks.paid.mockImplementation(async ({ call }) => call({}, { tag: "usage-tag" }));
  mocks.payment.mockResolvedValue(null);
});
it("uses current LLM Mentions account pricing for a 100-row admission, never the legacy preset", async () => {
  expect(await researchAiQuestions(context, { ...input, estimate_only: true })).toMatchObject({
    ok: true,
    estimate: true,
    estimatedCostCents: 20,
    pricingPolicy: "current_catalog",
    isGuaranteedMaximum: true,
  });
  expect(mocks.capabilities).toHaveBeenCalledTimes(1);
  expect(mocks.paid).not.toHaveBeenCalled();
  mocks.capabilities.mockResolvedValue({ ...capabilities, visibilityPricing: null });
  expect(await researchAiQuestions(context, input)).toMatchObject({
    ok: false,
    reason: "pricing_unavailable",
  });
  expect(mocks.paid).not.toHaveBeenCalled();
});
it("routes paid execution through shared preflight, feature attribution, payment child and retained receipts", async () => {
  const child = { operationKey: "payment-child" };
  const payment = {
    hasAttempted: false,
    child: vi.fn(() => child),
    receipt: vi.fn(() => undefined),
  } as unknown as ResearchAiPayment;
  mocks.payment.mockResolvedValue(payment);
  expect(await researchAiQuestions(context, input)).toMatchObject({
    ok: true,
    costCents: 12.5,
    result: { evidence: "observed_dataset" },
  });
  expect(mocks.preflight).toHaveBeenCalledWith(
    expect.objectContaining({ estimatedCostCents: 20, estimatedUsageQuantity: 1 }),
  );
  expect(mocks.paid).toHaveBeenCalledWith(
    expect.objectContaining({
      feature: "prompt_research",
      payment: child,
      rate: expect.objectContaining({ feature: "prompt_research", costCents: 20 }),
    }),
  );
  expect(mocks.cache).toHaveBeenCalledWith(
    expect.objectContaining({
      ttlSeconds: 60,
      key: expect.stringContaining("ai:prompt-research-v2:"),
    }),
  );
  expect(mocks.index).toHaveBeenCalledWith(
    expect.stringContaining("ai:prompt-research-project-v2:project:"),
    expect.objectContaining({ keyword: "tools", reportId: "agr_report" }),
    expect.any(Number),
  );
  expect(mocks.report).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "prompt_research",
      title: "Prompt Research: tools",
      provenance: expect.objectContaining({
        endpoint: "llm_mentions/search_mentions/live",
        evidence: "observed_dataset",
        scope: "provider_dataset_only",
        providerRequestIds: ["native-request"],
      }),
    }),
  );
});
it("cache hits cost zero and bypass pricing, payment admission and provider work", async () => {
  const first = await researchAiQuestions(context, input);
  expect(first.ok).toBe(true);
  const value = await mocks.cache.mock.calls[0][0].load();
  vi.clearAllMocks();
  mocks.cache.mockResolvedValue({ status: "success", cached: true, value });
  expect(await researchAiQuestions(context, { ...input, max_cost_cents: 0 })).toMatchObject({
    ok: true,
    cached: true,
    costCents: 0,
  });
  expect(mocks.capabilities).not.toHaveBeenCalled();
  expect(mocks.questions).not.toHaveBeenCalled();
  expect(mocks.payment).not.toHaveBeenCalled();
});
it("materializes project-bound acceptance evidence when sharing an account cache", async () => {
  await researchAiQuestions(context, input);
  const value = await mocks.cache.mock.calls[0][0].load();
  mocks.cache.mockResolvedValue({ status: "success", cached: true, value });
  mocks.report.mockResolvedValueOnce({ id: "agr_other" });
  expect(
    await researchAiQuestions({ ...context, projectId: "other" }, { ...input, max_cost_cents: 0 }),
  ).toMatchObject({ reportId: "agr_other", costCents: 0 });
  expect(mocks.report).toHaveBeenLastCalledWith(
    expect.objectContaining({ projectId: "other", kind: "prompt_research" }),
  );
});
it("cache-only misses and caps cannot dispatch or refresh metadata", async () => {
  expect(await researchAiQuestions(context, { ...input, max_cost_cents: 0 })).toMatchObject({
    ok: false,
    reason: "pricing_unavailable",
  });
  expect(mocks.capabilities).not.toHaveBeenCalled();
  expect(await researchAiQuestions(context, { ...input, max_cost_cents: 19 })).toMatchObject({
    ok: false,
    reason: "cost_limit_exceeded",
  });
  expect(mocks.paid).not.toHaveBeenCalled();
  expect(mocks.report).not.toHaveBeenCalled();
});

it("retains charged partial failures and blocks automatic paid retries through the cached result", async () => {
  const { ProviderCallError } = await import("@/lib/providers/call-error");
  mocks.questions.mockImplementationOnce(async (...args) => {
    args[4]?.();
    throw new ProviderCallError("Incomplete dataset", 7.5);
  });
  expect(await researchAiQuestions(context, input)).toMatchObject({
    ok: true,
    costCents: 7.5,
    result: { costStatus: "confirmed", rows: [], failure: expect.any(String) },
  });
  expect(mocks.questions).toHaveBeenCalledTimes(1);
});

it("uses the AI instance default when the project cache setting is unset", async () => {
  const source = await mocks.source();
  mocks.source.mockResolvedValue({
    ...source,
    project: { ...source.project, lookupCacheTtlSeconds: null },
  });
  await researchAiQuestions(context, input);
  expect(mocks.cache).toHaveBeenCalledWith(expect.objectContaining({ ttlSeconds: 43_200 }));
});
