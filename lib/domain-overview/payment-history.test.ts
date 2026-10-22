import type { ActionPaymentReceipt } from "@/lib/action-payment/contract";
import { beforeEach, expect, it, vi } from "vitest";
import { snapshotMetrics } from "./metrics";
import { domainPaymentHistory, retainDomainPayment } from "./payment-history";
import { findStoredDomainOverview } from "./stored";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { domainOverviewSnapshot: mocks } }));
const receipt: ActionPaymentReceipt = {
  actionId: "original-action",
  quoteId: "original-quote",
  state: "settled",
  option: {
    id: "original-option",
    connectionId: "conn_a00000000000000000000000",
    providerId: "original-provider",
    providerLabel: "Original provider",
    fundingSource: "byok",
    payableUnit: { kind: "currency", code: "USD" },
  },
  charge: { value: "0.123", unit: { kind: "currency", code: "USD" }, certainty: "measured" },
};
const key = {
  projectId: "project",
  provider: "original-provider",
  target: "example.com",
  scope: "root" as const,
  locationCode: 2840,
  languageCode: "en",
  fetchedAt: new Date(),
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.findFirst.mockResolvedValue({ overview: { count: 1 } });
  mocks.updateMany.mockResolvedValue({ count: 1 });
});

it("retains only validated original accounting facts with exact snapshot revision CAS", async () => {
  expect(await retainDomainPayment({ ...key, slot: "_payment", receipt })).toBe(true);
  expect(mocks.updateMany).toHaveBeenCalledWith({
    where: { ...key, overview: { equals: { count: 1 } } },
    data: { overview: { count: 1, _payment: receipt } },
  });
});
it("free cached action never overwrites the original history payer or debit", async () => {
  const free = {
    ...receipt,
    actionId: "free-read",
    state: "free" as const,
    charge: { ...receipt.charge, value: "0", certainty: "free" as const },
  };
  expect(await retainDomainPayment({ ...key, slot: "_payment", receipt: free })).toBe(false);
  expect(mocks.findFirst).not.toHaveBeenCalled();
  mocks.findUnique.mockResolvedValue({
    ...key,
    overview: { count: 1, _payment: receipt },
    previousOverview: null,
    rankedKeywords: null,
    relevantPages: null,
    history: null,
  });
  const stored = await findStoredDomainOverview(key);
  expect(stored).toMatchObject({ cached: true, costCents: 0, originalPayment: receipt });
  expect(stored).not.toHaveProperty("payment");
});
it("keeps append/history payments separate and refuses relabelling the original analysis", async () => {
  const source = { count: 1, _payment: receipt };
  mocks.findFirst.mockResolvedValue({ overview: source });
  const append = { ...receipt, actionId: "append-action" };
  expect(await retainDomainPayment({ ...key, slot: "_payment", receipt: append })).toBe(false);
  expect(mocks.updateMany).not.toHaveBeenCalled();
  expect(await retainDomainPayment({ ...key, slot: "_appendPayment", receipt: append })).toBe(true);
  expect(mocks.updateMany.mock.calls[0][0].data.overview).toEqual({
    ...source,
    _appendPayment: append,
  });
  mocks.findFirst.mockResolvedValue(null);
  expect(await retainDomainPayment({ ...key, slot: "_payment", receipt })).toBe(false);
});
it("preserves null/no-data meaning and omits unprovable or secret-bearing legacy metadata", () => {
  expect(snapshotMetrics({ _noData: true, _payment: receipt })).toBeNull();
  expect(domainPaymentHistory(null)).toEqual({});
  expect(domainPaymentHistory({ _payment: { ...receipt, quoteToken: "not-allowed" } })).toEqual({});
  expect(domainPaymentHistory({ _payment: receipt })).toEqual({ originalPayment: receipt });
});
it("fails closed for a receipt belonging to a different provider", async () => {
  await expect(
    retainDomainPayment({ ...key, provider: "another-provider", slot: "_payment", receipt }),
  ).rejects.toThrow("provider mismatch");
  expect(mocks.findFirst).not.toHaveBeenCalled();
});
