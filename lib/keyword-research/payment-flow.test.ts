import { APP_REQUEST_ORIGIN } from "@/lib/provider-usage/surface";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { researchKeywords } from "./service";

const mocks = vi.hoisted(() => ({
  project: vi.fn(),
  providers: {} as Record<string, unknown>,
  paid: vi.fn(),
  dfs: vi.fn(),
  future: vi.fn(),
  cache: vi.fn(),
  read: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/providers/registry", () => ({
  getSerpProvider: (id: string) => mocks.providers[id],
}));
vi.mock("@/lib/provider-lookups/paid-call-budget", () => ({ preflightProviderBudget: vi.fn() }));
vi.mock("@/lib/provider-lookups/connection-estimate", () => ({
  requiredConnectionEstimate: async () => 2,
}));
vi.mock("@/lib/provider-rates/connection-context", () => ({
  loadProviderRateContext: async () => ({ entries: [], manualAmountCents: null }),
}));
vi.mock("@/lib/provider-usage/byok-evidence-storage", () => ({
  loadByokEvidence: async () => ({
    measurementStatus: "recorded",
    costMeasurement: "recorded",
    quantityMeasurement: "recorded",
    costCents: "0",
    usageQuantity: "2",
  }),
}));
vi.mock("@/lib/action-payment/deployment-extension", () => ({
  quoteDeploymentPayment: async () => ({ authority: "frozen", amount: "4" }),
  readDeploymentPaymentAvailability: async () => ({
    availability: { allowed: true, reason: null },
  }),
  assertDeploymentPayment: vi.fn(),
  readDeploymentPayment: async () => ({ charge: "4", providerCostCents: "2", attempted: true }),
}));
vi.mock("./context", async (original) => ({
  ...(await original<typeof import("./context")>()),
  keywordResearchProject: mocks.project,
  researchLocation: async () => ({
    key: "US",
    value: {
      gl: "US",
      hl: "en",
      primaryGeoName: "United States",
      secondaryGeoName: "United States",
      primaryGeoCode: null,
    },
  }),
}));
vi.mock("./paid-call", async () => ({
  ProviderLookupSignal: (await import("@/lib/provider-lookups/lookup-failure"))
    .ProviderLookupSignal,
  paidProviderCall: mocks.paid,
}));
vi.mock("./cache", async (original) => ({
  ...(await original<typeof import("./cache")>()),
  withKeywordResearchCache: mocks.cache,
  readKeywordResearchCache: mocks.read,
}));
vi.mock("./snapshot", () => ({ maybePersistKeywordResearchSnapshot: vi.fn() }));
const dfsId = "conn_a00000000000000000000000",
  futureId = "conn_b00000000000000000000000";
const dfs = {
  id: "dataforseo",
  label: "DataForSEO",
  payment: { basis: "provider_cost", unit: { kind: "currency", code: "USD" } },
  fetchRelatedKeywords: mocks.dfs,
  fetchKeywordSuggestions: mocks.dfs,
  fetchKeywordIdeas: mocks.dfs,
};
const future = {
  id: "future",
  label: "Future",
  payment: {
    basis: "provider_quantity",
    unit: {
      kind: "provider_native",
      providerId: "future",
      key: "queries",
      singular: "query",
      plural: "queries",
    },
    estimateQuantity: () => "2",
  },
  fetchKeywordSuggestions: mocks.future,
};
const connections = [
  {
    id: "dfs-internal",
    publicId: dfsId,
    provider: "dataforseo",
    credentialSource: "own",
    credentialsEncrypted: "dfs-key",
  },
  {
    id: "future-internal",
    publicId: futureId,
    provider: "future",
    credentialSource: "own",
    credentialsEncrypted: "future-key",
  },
];
const project = {
  id: "project",
  publicId: "prj_a00000000000000000000000",
  ownerId: "owner",
  providerConnections: connections,
  keywords: [],
  savedKeywords: [],
};
const row = {
  keyword: "result",
  competition: null,
  cpcCents: null,
  difficulty: null,
  intent: null,
  monthlyTrend: [],
  searchVolume: null,
};
const input = {
  actorId: "owner",
  projectId: "project",
  includeClickstream: false,
  mode: "suggestions" as const,
  origin: APP_REQUEST_ORIGIN,
  resultLimit: 100,
  seed: "seed",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.providers = { dataforseo: dfs, future };
  connections[1].credentialSource = "own";
  mocks.project.mockResolvedValue(project);
  mocks.read.mockResolvedValue(null);
  mocks.dfs.mockResolvedValue({ costCents: 2, rows: [row] });
  mocks.future.mockResolvedValue({ costCents: 0, rows: [row] });
  mocks.cache.mockImplementation(async ({ load }) => ({
    status: "success",
    cached: false,
    value: await load(),
  }));
  mocks.paid.mockImplementation(async ({ call, payment }) => {
    const result = await call({});
    if (payment) await payment.record({ attemptIds: ["retained-proof"] });
    return result;
  });
});
describe("authoritative research payable flow", () => {
  it("offers a partial-capability future provider for its real action and executes that exact option", async () => {
    const preview = await researchKeywords({ ...input, estimateOnly: true });
    expect(preview).toMatchObject({ ok: true, estimate: true });
    if (!preview.ok || !("paymentOptions" in preview)) throw new Error("preview");
    expect(preview.paymentOptions).toHaveLength(2);
    const option = preview.paymentOptions!.find((item) => item.providerId === "future")!;
    const selected = await researchKeywords({
      ...input,
      connectionId: option.connectionId,
      paymentOptionId: option.id,
      estimateOnly: true,
    });
    if (!selected.ok || !("estimate" in selected) || !selected.payment)
      throw new Error("selected quote");
    expect(selected.payment.charge).toMatchObject({ value: "2", unit: { key: "queries" } });
    const result = await researchKeywords({
      ...input,
      connectionId: option.connectionId,
      paymentOptionId: option.id,
      requirePayment: true,
      acceptedPayment: { quoteToken: selected.payment.quoteToken },
    });
    expect(result).toMatchObject({
      ok: true,
      provider: "Future",
      payment: { state: "settled", charge: { value: "2", unit: { key: "queries" } } },
    });
    expect(mocks.future).toHaveBeenCalledOnce();
    expect(mocks.dfs).not.toHaveBeenCalled();
  });
  it("does not offer suggestions-only provider for combined mode", async () => {
    const preview = await researchKeywords({ ...input, mode: "auto", estimateOnly: true });
    expect(preview).toMatchObject({
      paymentOptions: [expect.objectContaining({ providerId: "dataforseo" })],
    });
  });
  it("refuses changed funding before provider execution", async () => {
    const preview = await researchKeywords({
      ...input,
      connectionId: futureId,
      estimateOnly: true,
    });
    if (!preview.ok || !("estimate" in preview) || !preview.payment) throw new Error("preview");
    connections[1].credentialSource = "hosted";
    expect(
      await researchKeywords({
        ...input,
        connectionId: futureId,
        acceptedPayment: { quoteToken: preview.payment.quoteToken },
      }),
    ).toEqual({ ok: false, reason: "payment_quote_changed" });
    expect(mocks.paid).not.toHaveBeenCalled();
  });
  it("cache current charge is0 even though legacy source retains historicalcost", async () => {
    mocks.read.mockResolvedValue({
      fetchedAt: new Date().toISOString(),
      costCents: 9,
      rows: [row],
    });
    mocks.cache.mockResolvedValue({
      status: "success",
      cached: true,
      value: { fetchedAt: new Date().toISOString(), costCents: 9, rows: [row] },
    });
    const result = await researchKeywords({
      ...input,
      connectionId: futureId,
      requirePayment: true,
    });
    expect(result).toMatchObject({
      ok: true,
      cached: true,
      costCents: 9,
      payment: { state: "free", charge: { value: "0" } },
    });
    expect(mocks.paid).not.toHaveBeenCalled();
  });
  it("retains an actual charge when provider fails after settlement", async () => {
    mocks.paid.mockImplementationOnce(async ({ payment }) => {
      await payment.record({ attemptIds: ["retained-proof"] });
      throw new Error("provider failed");
    });
    expect(await researchKeywords({ ...input, connectionId: futureId })).toMatchObject({
      ok: false,
      reason: "provider_error",
      payment: { state: "settled", charge: { value: "2", unit: { key: "queries" } } },
    });
  });
});

it("retains an earlier actual charge when a later native wallet budget refuses admission", async () => {
  const { DeploymentAdmissionExhaustedError } = await import(
    "@/lib/providers/execution-extension-errors"
  );
  const { withLookupBudgetResult } = await import("@/lib/actions/lookup-budget-result");
  const evidence = vi
    .spyOn(await import("@/lib/provider-usage/byok-evidence-storage"), "loadByokEvidence")
    .mockResolvedValue({
      measurementStatus: "recorded",
      costMeasurement: "recorded",
      quantityMeasurement: "recorded",
      costCents: "2",
      usageQuantity: "1",
    } as never);
  const auto = { ...input, mode: "auto" as const, requirePayment: true };
  const quote = await researchKeywords({ ...auto, estimateOnly: true });
  if (!quote.ok || !("estimate" in quote) || !quote.payment) throw new Error("quote");
  mocks.paid
    .mockImplementationOnce(async ({ call, payment }) => {
      const result = await call({});
      await payment.record({ attemptIds: ["earlier-settled"] });
      return result;
    })
    .mockRejectedValueOnce(new DeploymentAdmissionExhaustedError("budget", { scope: "wallet" }));
  const result = await withLookupBudgetResult(() =>
    researchKeywords({ ...auto, acceptedPayment: { quoteToken: quote.payment!.quoteToken } }),
  );
  expect(result).toMatchObject({
    ok: false,
    reason: "wallet_budget_exhausted",
    costCents: 2,
    payment: {
      state: "settled",
      charge: { value: "0.02", certainty: "measured", unit: { kind: "currency", code: "USD" } },
    },
  });
  expect(mocks.paid).toHaveBeenCalledTimes(2);
  evidence.mockRestore();
});
