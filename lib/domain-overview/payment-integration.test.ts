import { APP_REQUEST_ORIGIN } from "@/lib/provider-usage/surface";
import { DeploymentAdmissionExhaustedError } from "@/lib/providers/execution-extension-errors";
import { beforeEach, expect, it, vi } from "vitest";
import {
  analyzeDomainOverview,
  loadDomainKeywordsPage,
  loadDomainOverviewHistory,
} from "./service";

const mocks = vi.hoisted(() => ({
  project: vi.fn(),
  connection: vi.fn(),
  cached: vi.fn(),
  paid: vi.fn(),
  persistModules: vi.fn(),
  ledger: vi.fn(),
  overviewAvailable: false,
}));
vi.mock("@/lib/provider-lookups/paid-call-budget", () => ({
  preflightProviderBudget: async () => undefined,
}));
vi.mock("@/lib/providers/crypto", () => ({ getPurposeSecretKeys: () => [Buffer.alloc(32, 6)] }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    project: { findFirst: mocks.project },
    providerConnection: { findUnique: mocks.connection },
  },
}));
vi.mock("@/lib/providers/registry", () => ({ getSerpProvider: () => provider }));
vi.mock("@/lib/action-payment/receipt", async (original) => ({
  ...(await original<typeof import("@/lib/action-payment/receipt")>()),
  readPaymentPart: mocks.ledger,
}));
vi.mock("@/lib/provider-lookups/paid-call", async (original) => ({
  ...(await original<typeof import("@/lib/provider-lookups/paid-call")>()),
  paidProviderCall: mocks.paid,
  preflightProviderBudget: async () => undefined,
}));
vi.mock("./cache", async (original) => ({
  ...(await original<typeof import("./cache")>()),
  readDomainOverviewCache: mocks.cached,
  withDomainOverviewCache: async ({ load }: { load: () => Promise<unknown> }) => {
    const value = await mocks.cached();
    return value
      ? { status: "success", cached: true, value }
      : { status: "success", cached: false, value: await load() };
  },
}));
vi.mock("./payment-history", async (original) => ({
  ...(await original<typeof import("./payment-history")>()),
  retainDomainPayment: async () => false,
}));
vi.mock("./snapshot", () => ({
  findDomainOverviewSnapshot: async () => ({ fetchedAt: new Date() }),
  findDomainOverviewSnapshotMetadata: async () => null,
  persistDomainOverviewHistory: async () => undefined,
  persistDomainOverviewModules: mocks.persistModules,
  resolveDomainOverviewSnapshot: async (input: { payment: () => unknown }) => {
    const { fetchDomainOverviewMetrics } = await import("./provider-call");
    const result = await fetchDomainOverviewMetrics({
      ...input,
      payment: input.payment?.(),
    } as Parameters<typeof fetchDomainOverviewMetrics>[0]);
    return {
      cached: false,
      costCents: result.costCents,
      durable: false,
      modules: {},
      data: {
        overview: mocks.overviewAvailable ? { count: 1 } : null,
        provider: "dataforseo",
        fetchedAt: new Date().toISOString(),
        cachedUntil: new Date(Date.now() + 60000).toISOString(),
        previousFetchedAt: null,
        previousOverview: null,
        previousSourceSnapshotAt: null,
        sourceSnapshotAt: null,
      },
    };
  },
}));

const unit = { kind: "currency" as const, code: "USD" };
const provider = {
  id: "dataforseo",
  label: "DataForSEO",
  payment: { basis: "provider_cost" as const, unit },
  fetchDomainRankOverview: vi.fn(async () => ({ costCents: 2, metrics: null })),
  fetchHistoricalRankOverview: vi.fn(async () => ({ costCents: 2, rows: [] })),
  fetchRankedKeywords: vi.fn(async () => ({
    costCents: 2,
    rows: [],
    totalCount: 0,
    consumedCount: 0,
  })),
  fetchRelevantPages: vi.fn(async () => ({
    costCents: 2,
    rows: [],
    totalCount: 0,
    consumedCount: 0,
  })),
};
const connection = {
  id: "connection",
  publicId: "conn_a00000000000000000000000",
  provider: provider.id,
  credentialSource: "own" as const,
  credentialsEncrypted: "encrypted",
  updatedAt: new Date(),
};
const project = {
  id: "project",
  publicId: "prj_example",
  ownerId: "owner",
  lookupCacheTtlSeconds: null,
  providerConnections: [connection],
};
const context = { actorId: "actor", origin: APP_REQUEST_ORIGIN, projectId: "prj_example" };
const request = {
  target: "example.com",
  countryCode: "US",
  languageCode: "en",
  locationCode: 2840,
  requirePayment: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.overviewAvailable = false;
  mocks.persistModules.mockResolvedValue(undefined);
  mocks.project.mockResolvedValue(project);
  mocks.cached.mockResolvedValue(null);
  mocks.connection.mockResolvedValue({
    ...connection,
    enabled: true,
    status: "connected",
    projectId: project.id,
    project: { ownerId: project.ownerId },
  });
  mocks.ledger.mockResolvedValue({
    attempted: true,
    charge: { value: "0.02", unit, certainty: "measured" },
  });
  mocks.paid.mockImplementation(async (input) => {
    const tx = { providerConnection: { findUnique: mocks.connection }, $queryRaw: vi.fn() };
    if (input.payment) {
      await input.payment.guard.lockBusiness(tx);
      await input.payment.guard.assertRequest(tx);
    }
    const result = await input.call({});
    if (input.payment) await input.payment.record({ attemptIds: ["actual-attempt"] });
    return result;
  });
});

it("keeps analysis consent while reporting only the actual charge when no-data stops later modules", async () => {
  const estimate = await analyzeDomainOverview(context, { ...request, estimateOnly: true });
  expect(mocks.paid).not.toHaveBeenCalled();
  if (!estimate.ok || !("estimate" in estimate) || !estimate.payment)
    throw new Error("Missing quote");
  const result = await analyzeDomainOverview(context, {
    ...request,
    acceptedPayment: { quoteToken: estimate.payment.quoteToken },
  });
  expect(result).toMatchObject({
    ok: true,
    state: "no_data",
    payment: { state: "settled", quoteId: estimate.payment.id, charge: { value: "0.02", unit } },
  });
  expect(mocks.paid).toHaveBeenCalledTimes(1);
  expect(provider.fetchRankedKeywords).not.toHaveBeenCalled();
});

it("quotes a page without fetching it and binds accepted consent to its exact offset", async () => {
  const page = { ...request, limit: 100, offset: 100 };
  const estimate = await loadDomainKeywordsPage(context, { ...page, estimateOnly: true });
  if (!estimate.ok || !("estimate" in estimate) || !estimate.payment)
    throw new Error("Missing quote");
  expect(mocks.paid).not.toHaveBeenCalled();
  const acceptedPayment = { quoteToken: estimate.payment.quoteToken };
  expect(
    await loadDomainKeywordsPage(context, { ...page, offset: 200, acceptedPayment }),
  ).toMatchObject({ ok: false, reason: "payment_quote_changed" });
  expect(mocks.paid).not.toHaveBeenCalled();
  expect(await loadDomainKeywordsPage(context, { ...page, acceptedPayment })).toMatchObject({
    ok: true,
    payment: { state: "settled", charge: { value: "0.02" } },
  });
  expect(provider.fetchRankedKeywords).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ offset: 100, limit: 100 }),
  );
});

it("refuses missing consent and does not turn a free history cache quote into paid work", async () => {
  expect(await loadDomainOverviewHistory(context, request)).toMatchObject({
    ok: false,
    reason: "payment_quote_required",
  });
  expect(provider.fetchHistoricalRankOverview).not.toHaveBeenCalled();
  mocks.cached.mockResolvedValue({ data: [], costCents: 2, fetchedAt: new Date().toISOString() });
  const estimate = await loadDomainOverviewHistory(context, { ...request, estimateOnly: true });
  if (!estimate.ok || !("estimate" in estimate) || !estimate.payment)
    throw new Error("Missing quote");
  expect(estimate.payment.charge).toMatchObject({ value: "0", certainty: "free" });
  mocks.cached.mockResolvedValue(null);
  expect(
    await loadDomainOverviewHistory(context, {
      ...request,
      acceptedPayment: { quoteToken: estimate.payment.quoteToken },
    }),
  ).toMatchObject({ ok: false, reason: "payment_quote_changed" });
  expect(provider.fetchHistoricalRankOverview).not.toHaveBeenCalled();
});

it("returns actual unknown accounting when overview dispatch failed after an attempt, without inventing a settled price", async () => {
  const estimate = await analyzeDomainOverview(context, { ...request, estimateOnly: true });
  if (!estimate.ok || !("estimate" in estimate) || !estimate.payment)
    throw new Error("Missing quote");
  mocks.ledger.mockResolvedValue({
    attempted: true,
    charge: { value: null, unit, certainty: "unknown" },
  });
  mocks.paid.mockImplementationOnce(async (input) => {
    await input.payment.record({ attemptIds: ["failed-real-attempt"] });
    throw new Error("Provider disconnected after dispatch");
  });
  expect(
    await analyzeDomainOverview(context, {
      ...request,
      acceptedPayment: { quoteToken: estimate.payment.quoteToken },
    }),
  ).toMatchObject({
    ok: false,
    payment: { state: "unknown", charge: { value: null, certainty: "unknown" } },
  });
});

it("retains all completed child charges when another native admission refuses after paid overview", async () => {
  const estimate = await analyzeDomainOverview(context, { ...request, estimateOnly: true });
  if (!estimate.ok || !("estimate" in estimate) || !estimate.payment)
    throw new Error("Missing quote");
  mocks.overviewAvailable = true;
  let calls = 0;
  mocks.paid.mockImplementation(async (input) => {
    calls++;
    if (calls === 2)
      throw new DeploymentAdmissionExhaustedError("budget", {
        scope: "connection",
        budgetReason: "budget_missing",
      });
    if (calls === 3) await new Promise((resolve) => setTimeout(resolve, 10));
    const result = await input.call({});
    await input.payment.record({ attemptIds: [`actual-attempt-${calls}`] });
    return result;
  });
  const result = await analyzeDomainOverview(context, {
    ...request,
    acceptedPayment: { quoteToken: estimate.payment.quoteToken },
  });
  expect(result).toMatchObject({
    ok: false,
    reason: "budget_exhausted",
    budgetReason: "budget_missing",
    payment: { state: "settled", charge: { value: "0.04" } },
  });
  expect(mocks.ledger).toHaveBeenCalledTimes(2);
  expect(mocks.persistModules).toHaveBeenCalledWith(
    expect.objectContaining({
      keywords: { reason: "payment_admission", phase: "before_dispatch" },
      pages: expect.objectContaining({ rows: expect.any(Array) }),
    }),
  );
});
