import { APP_REQUEST_ORIGIN } from "@/lib/provider-usage/surface";
import { beforeEach, expect, it, vi } from "vitest";
import { analyzeBacklinks, loadMoreBacklinkRows } from "./service";

const mocks = vi.hoisted(() => ({
  project: vi.fn(),
  connection: vi.fn(),
  cached: vi.fn(),
  metadata: vi.fn(),
  paid: vi.fn(),
  retain: vi.fn(),
  claim: vi.fn(),
  ledger: vi.fn(),
}));
vi.mock("@/lib/provider-lookups/paid-call-budget", () => ({
  preflightProviderBudget: async () => undefined,
}));
vi.mock("@/lib/providers/crypto", () => ({ getPurposeSecretKeys: () => [Buffer.alloc(32, 9)] }));
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
  withBacklinksCache: async ({ load }: { load: () => Promise<unknown> }) => ({
    status: "success",
    cached: false,
    value: await load(),
  }),
  invalidateBacklinksCache: async () => undefined,
}));
vi.mock("./snapshot-reference", () => ({
  openBacklinksSnapshotReference: () => ({ id: "snapshot", fetchedRowCount: 100 }),
}));
vi.mock("./append-claim", () => ({
  claimBacklinksAppend: mocks.claim,
  releaseUnsentBacklinksAppend: vi.fn(),
}));
vi.mock("./append-evidence", () => ({
  retainedBacklinksPage: () => null,
  retainBacklinksPage: mocks.retain,
}));
vi.mock("./snapshot", () => ({
  findBacklinksSnapshot: mocks.cached,
  findBacklinksSnapshotMetadata: mocks.metadata,
  persistBacklinksSnapshot: async (value: object) => value,
  findCurrentBacklinksSnapshot: async () => ({
    id: "snapshot",
    projectId: "project",
    fetchedRowCount: 100,
    totalRowsAvailable: 200,
    summary: {},
    expiresAt: new Date(Date.now() + 60000),
  }),
  appendBacklinksRows: async () => ({ fetchedRowCount: 101 }),
  snapshotMode: () => "as_is",
  snapshotProvider: () => "dataforseo",
  snapshotEnvelope: (_value: object, input: { cached: boolean; costCents: number }) => ({
    ok: true,
    ...input,
    rows: [],
  }),
}));

const unit = { kind: "currency" as const, code: "USD" };
const provider = {
  id: "dataforseo",
  label: "DataForSEO",
  payment: { basis: "provider_cost" as const, unit },
  fetchBacklinksSummary: vi.fn(async () => ({ costCents: 2, summary: {} })),
  fetchBacklinksHistory: vi.fn(async () => ({ costCents: 2, rows: [] })),
  fetchBacklinksRows: vi.fn(async () => ({ costCents: 2, totalCount: 200, rows: [] })),
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
const request = { target: "example.com", requirePayment: true };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.project.mockResolvedValue(project);
  mocks.cached.mockResolvedValue(null);
  mocks.metadata.mockResolvedValue(null);
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
  mocks.claim.mockResolvedValue({ token: "claim", summary: {} });
  mocks.retain.mockResolvedValue({ token: "claim", summary: {} });
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

it("quotes without I/O and carries exact child consent plus actual ledger receipt through analysis", async () => {
  const estimate = await analyzeBacklinks(context, { ...request, estimateOnly: true });
  expect(estimate).toMatchObject({
    ok: true,
    estimate: true,
    payment: { option: { fundingSource: "byok", payableUnit: unit } },
  });
  expect(mocks.paid).not.toHaveBeenCalled();
  if (!estimate.ok || !("estimate" in estimate) || !estimate.payment)
    throw new Error("Missing quote");
  const result = await analyzeBacklinks(context, {
    ...request,
    acceptedPayment: { quoteToken: estimate.payment.quoteToken },
  });
  expect(result).toMatchObject({
    ok: true,
    payment: {
      state: "settled",
      quoteId: estimate.payment.id,
      charge: { value: "0.06", unit, certainty: "measured" },
    },
  });
  expect(mocks.paid).toHaveBeenCalledTimes(3);
  expect(new Set(mocks.paid.mock.calls.map(([input]) => input.payment.operationKey)).size).toBe(3);
});

it("requires consent and refuses changed route before any provider callback", async () => {
  expect(await analyzeBacklinks(context, request)).toMatchObject({
    ok: false,
    reason: "payment_quote_required",
  });
  expect(provider.fetchBacklinksSummary).not.toHaveBeenCalled();
  const estimate = await analyzeBacklinks(context, { ...request, estimateOnly: true });
  if (!estimate.ok || !("estimate" in estimate) || !estimate.payment)
    throw new Error("Missing quote");
  mocks.project.mockResolvedValue({
    ...project,
    providerConnections: [{ ...connection, credentialsEncrypted: "changed" }],
  });
  expect(
    await analyzeBacklinks(context, {
      ...request,
      acceptedPayment: { quoteToken: estimate.payment.quoteToken },
    }),
  ).toMatchObject({ ok: false, reason: "payment_quote_changed" });
  expect(provider.fetchBacklinksSummary).not.toHaveBeenCalled();
});

it("never turns accepted free cached analysis into a paid load after eviction", async () => {
  const cached = { expiresAt: new Date(Date.now() + 60000), fetchedAt: new Date() };
  mocks.metadata.mockResolvedValue(cached);
  const estimate = await analyzeBacklinks(context, { ...request, estimateOnly: true });
  if (!estimate.ok || !("estimate" in estimate) || !estimate.payment)
    throw new Error("Missing quote");
  expect(estimate.payment.charge).toMatchObject({ value: "0", certainty: "free" });
  mocks.metadata.mockResolvedValue(null);
  expect(
    await analyzeBacklinks(context, {
      ...request,
      acceptedPayment: { quoteToken: estimate.payment.quoteToken },
    }),
  ).toMatchObject({ ok: false, reason: "payment_quote_changed" });
  expect(provider.fetchBacklinksSummary).not.toHaveBeenCalled();
});

it("binds append consent to its snapshot revision and retains the actual page payment", async () => {
  const page = {
    ...request,
    includeSubdomains: true,
    limit: 100,
    targetScope: "site" as const,
    snapshotRef: "revision-a",
  };
  const estimate = await loadMoreBacklinkRows(context, { ...page, estimateOnly: true });
  if (!estimate.ok || !("estimate" in estimate) || !estimate.payment)
    throw new Error("Missing quote");
  const acceptedPayment = { quoteToken: estimate.payment.quoteToken };
  expect(
    await loadMoreBacklinkRows(context, { ...page, snapshotRef: "revision-b", acceptedPayment }),
  ).toMatchObject({ ok: false, reason: "payment_quote_changed" });
  expect(mocks.claim).not.toHaveBeenCalled();
  const result = await loadMoreBacklinkRows(context, { ...page, acceptedPayment });
  expect(result).toMatchObject({ payment: { state: "settled", charge: { value: "0.02" } } });
  expect(mocks.retain).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    expect.objectContaining({ payment: expect.objectContaining({ quoteId: estimate.payment.id }) }),
  );
});

it("keeps an attempted failure receipt and does not imply that a failed request was free", async () => {
  const estimate = await analyzeBacklinks(context, { ...request, estimateOnly: true });
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
    await analyzeBacklinks(context, {
      ...request,
      acceptedPayment: { quoteToken: estimate.payment.quoteToken },
    }),
  ).toMatchObject({
    ok: false,
    reason: "provider_error",
    payment: { state: "unknown", charge: { value: null, certainty: "unknown" } },
  });
});
