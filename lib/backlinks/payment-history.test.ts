import type { ActionPaymentReceipt } from "@/lib/action-payment/contract";
import { beforeEach, expect, it, vi } from "vitest";
import { backlinksPaymentHistory, retainedBacklinksPayment } from "./payment-history";
import { persistBacklinksSnapshot } from "./snapshot";
import { snapshotEnvelope } from "./stored";

const mocks = vi.hoisted(() => ({ create: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("./snapshot-reference", () => ({ backlinksSnapshotReference: () => "reference" }));
const receipt: ActionPaymentReceipt = {
  actionId: "original",
  quoteId: "quote-original",
  state: "settled",
  option: {
    id: "route-original",
    connectionId: "conn_a00000000000000000000000",
    providerId: "original-provider",
    providerLabel: "Original provider",
    fundingSource: "byok",
    payableUnit: { kind: "currency", code: "USD" },
  },
  charge: { value: "0.2", unit: { kind: "currency", code: "USD" }, certainty: "measured" },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation((run) =>
    run({ backlinkSnapshot: { create: mocks.create } }),
  );
});

it("stores only the actual analysis receipt beside existing snapshot summary", async () => {
  const input = {
    payment: receipt,
    costCents: 20,
    fetchedAt: new Date(),
    history: [],
    includeSubdomains: true,
    mode: "as_is" as const,
    projectId: "project",
    provider: receipt.option.providerId,
    rows: [],
    scope: "site" as const,
    target: "example.com",
    totalRowsAvailable: 0,
    summary: {
      backlinksTotal: 0,
      brokenBacklinks: 0,
      brokenPages: 0,
      dofollowPct: 0,
      domainRank: 0,
      lostBacklinks: 0,
      lostReferringDomains: 0,
      newBacklinks: 0,
      newReferringDomains: 0,
      referringDomainsTotal: 0,
      referringPages: 0,
      spamScore: 0,
    },
  };
  await persistBacklinksSnapshot(input);
  expect(mocks.create.mock.calls[0][0].data.summary).toMatchObject({
    _payment: receipt,
    _provider: receipt.option.providerId,
  });
});
it("keeps an action's free read separate from the original stored payment", () => {
  const now = new Date();
  const snapshot = {
    id: "snapshot",
    projectId: "project",
    fetchedAt: now,
    expiresAt: new Date(now.getTime() + 60000),
    fetchedRowCount: 0,
    totalRowsAvailable: 0,
    rows: [],
    history: [],
    summary: { _provider: receipt.option.providerId, _payment: receipt },
    includeSubdomains: true,
    target: "example.com",
    targetScope: "site",
    costCents: 20,
  };
  const result = snapshotEnvelope(snapshot, { cached: true, costCents: 0, now });
  expect(result).toMatchObject({ cached: true, costCents: 0, originalPayment: receipt });
  expect(result).not.toHaveProperty("payment");
});
it("never fabricates legacy receipt or exposes unvalidated metadata", () => {
  expect(backlinksPaymentHistory({})).toEqual({});
  expect(backlinksPaymentHistory({ _payment: { ...receipt, wallet: { secret: true } } })).toEqual(
    {},
  );
  expect(() => retainedBacklinksPayment(receipt, "different-provider")).toThrow(
    "provider mismatch",
  );
});
