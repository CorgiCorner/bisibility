import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { comparisonFixture } from "./fixtures.test-support";
import { comparisonHash } from "./model";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  run: vi.fn(),
  update: vi.fn(),
  side: vi.fn(),
  connection: vi.fn(),
  access: vi.fn(),
  quote: vi.fn(),
  start: vi.fn(),
  journal: vi.fn(),
  fetch: vi.fn(),
  provider: vi.fn(),
  fence: vi.fn(),
  evidence: vi.fn(),
  hostedEvidence: vi.fn(),
  ownKey: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    providerComparisonRun: { findFirst: mocks.run },
    providerComparisonSide: { updateMany: mocks.update, findFirst: mocks.side },
    providerConnection: { findFirst: mocks.connection },
    meteringUsageEvidence: { findMany: mocks.evidence },
  },
}));
vi.mock("./access", () => ({ assertComparisonAccess: mocks.access }));
vi.mock("./quote", () => ({ quoteComparison: mocks.quote }));
vi.mock("./fence", () => ({ comparisonFences: mocks.fence }));
vi.mock("@/lib/providers/execution-extension", () => ({
  startDeploymentExecution: mocks.start,
  readDeploymentMeteringEvidence: mocks.hostedEvidence,
}));
vi.mock("@/lib/provider-usage/request-journal", () => ({
  createProviderRequestJournal: mocks.journal,
}));
vi.mock("@/lib/provider-usage/tag", () => ({
  createProviderRequestAttribution: async (context: unknown) => ({
    context,
    tag: "comparison-tag",
  }),
}));
vi.mock("@/lib/providers/credentials", () => ({
  resolveProviderCredentials: () => ({ apiKey: "fake-isolated" }),
}));
vi.mock("@/lib/providers/own-key-guard", () => ({ assertOwnKeyStored: mocks.ownKey }));
vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: async () => ({ success: true }),
}));
vi.mock("@/lib/providers/registry", () => ({ getSerpProvider: mocks.provider }));

import { executeComparisonSide } from "./execution";

describe("comparison worker execution remains separate from rank history", () => {
  let snapshot = comparisonFixture();
  let row: any;
  let usage: any;
  let proofs: any[];
  const input = { projectId: "project", runId: "run", provider: "dataforseo" as const };
  beforeEach(() => {
    vi.clearAllMocks();
    snapshot = comparisonFixture();
    row = {
      id: "side",
      runId: "run",
      projectId: "project",
      provider: "dataforseo",
      status: "queued",
      attemptIds: [],
    };
    usage = {
      started: false,
      costCents: 0,
      quantity: 0,
      finish: vi.fn().mockResolvedValue(undefined),
      credentials: {},
    };
    proofs = [];
    // Match the actual BYOK journal: begin leaves prior known aggregate getters unchanged.
    usage.observer = {
      begin: vi.fn(async () => {
        usage.started = true;
        const id = `attempt-${proofs.length}`;
        row.attemptIds.push(id);
        proofs.push({ id, measurementStatus: "unknown", discarded: false, receipt: null });
        return id;
      }),
      settle: vi.fn(async () => {
        const proof = proofs.at(-1);
        proof.measurementStatus = "recorded";
        proof.receipt = { costCents: "2", quantity: "1" };
        usage.costCents += 2;
        usage.quantity += 1;
      }),
    };
    mocks.evidence.mockImplementation(async () => proofs);
    mocks.hostedEvidence.mockImplementation(async () => ({
      snapshot: {
        projectId: "project",
        connectionId: "connection-dataforseo",
        correlationId: "comparison:side",
      },
      costCents: proofs.every((item) => item.measurementStatus === "recorded")
        ? String(usage.costCents)
        : null,
      usageQuantity: String(usage.quantity),
      customerCents: "6",
    }));
    usage.credentials.usageObserver = usage.observer;
    const tx = {
      providerComparisonRun: { findFirst: mocks.run },
      providerComparisonSide: { updateMany: mocks.update },
    };
    mocks.transaction.mockImplementation((callback: any) => callback(tx));
    mocks.run.mockImplementation(async () => ({
      id: "run",
      actorId: "actor",
      snapshot,
      sourceHash: comparisonHash(snapshot),
      sides: [row],
      cancellationRequested: false,
    }));
    mocks.side.mockImplementation(async () => row);
    mocks.update.mockImplementation(async ({ where, data }: any) => {
      if (where.status && typeof where.status === "string" && row.status !== where.status)
        return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    });
    mocks.connection.mockResolvedValue({ credentialsEncrypted: "fake" });
    mocks.access.mockResolvedValue(undefined);
    mocks.ownKey.mockResolvedValue(undefined);
    mocks.quote.mockImplementation(async () => snapshot);
    mocks.fence.mockReturnValue({
      beforeReserve: { lockBusiness: vi.fn(), assertRequest: vi.fn() },
      beforeFence: { lockBusiness: vi.fn(), assertDispatch: vi.fn() },
    });
    mocks.journal.mockImplementation(() => usage);
    mocks.start.mockResolvedValue(usage);
    mocks.provider.mockReturnValue({ fetchRank: mocks.fetch });
    mocks.fetch.mockImplementation(async (call: any) => {
      await call.credentials.usageObserver.begin();
      await call.credentials.usageObserver.settle();
      return {
        position: 3,
        rankingUrl: "https://example.com/a",
        costCents: 2,
        checkedAt: new Date(),
        raw: {
          organic_results: [
            { rank: 3, url: "https://example.com/a", title: "Example", domain: "example.com" },
          ],
        },
      };
    });
  });
  it("claims once before I/O, uses BYOK journal hooks and persists isolated result/cost", async () => {
    await executeComparisonSide(input);
    expect(row.status).toBe("completed");
    expect(row.result).toMatchObject({ position: 3, observedAt: null, evidence: "positive" });
    expect(row.costCents).toBe(2);
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.journal).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        keywordId: "keyword",
        beforeReserve: expect.any(Object),
        beforeFence: expect.any(Object),
      }),
    );
    expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.fetch.mock.invocationCallOrder[0],
    );
    await executeComparisonSide(input);
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });
  it("hosted generic rank execution passes BOTH rank IDs absent to the maintained facade", async () => {
    snapshot = comparisonFixture("hosted");
    mocks.start.mockImplementation(async (request: any) => {
      expect(request.rankCheckId).toBeUndefined();
      expect(request.keywordId).toBeUndefined();
      return usage;
    });
    await executeComparisonSide(input);
    expect(row.status).toBe("completed");
    expect(row.customerCostCents).toBe(6);
    expect(mocks.start).toHaveBeenCalledWith(
      expect.objectContaining({ operationKey: "provider-comparison:side", maxCostCents: 6 }),
    );
    expect(mocks.journal).not.toHaveBeenCalled();
  });
  it("unknown receipt never becomes zero and a restarted activity cannot rebuy", async () => {
    mocks.fetch.mockImplementation(async (call: any) => {
      await call.credentials.usageObserver.begin();
      throw new ProviderUsagePersistenceError();
    });
    await executeComparisonSide(input);
    expect(row).toMatchObject({
      status: "unknown",
      costCents: null,
      quantity: null,
      reason: "usage_unconfirmed",
    });
    await executeComparisonSide(input);
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });
  it("a known first page plus an admitted unknown second page invalidates partial totals", async () => {
    mocks.fetch.mockImplementation(async (call: any) => {
      await call.credentials.usageObserver.begin();
      await call.credentials.usageObserver.settle();
      await call.credentials.usageObserver.begin();
      throw new Error("second page timeout");
    });
    await executeComparisonSide(input);
    expect(usage.costCents).toBe(2);
    expect(usage.quantity).toBe(1);
    expect(row).toMatchObject({ status: "unknown", costCents: null, quantity: null });
    await executeComparisonSide(input);
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });
  it("retains a valid observation when its native receipt is still unknown", async () => {
    mocks.evidence.mockImplementation(async () =>
      proofs.map((proof) => ({ ...proof, measurementStatus: "unknown", receipt: null })),
    );
    await executeComparisonSide(input);
    expect(row).toMatchObject({
      status: "unknown",
      costCents: null,
      quantity: null,
      reason: "usage_unconfirmed",
      result: { position: 3, rankingUrl: "https://example.com/a", evidence: "positive" },
    });
    await executeComparisonSide(input);
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });
  it("durably retains the result before hosted accounting finalization fails", async () => {
    snapshot = comparisonFixture("hosted");
    usage.finish.mockImplementation(async () => {
      expect(row.result).toMatchObject({ position: 3 });
      throw new ProviderUsagePersistenceError();
    });
    await executeComparisonSide(input);
    expect(row).toMatchObject({
      status: "unknown",
      costCents: null,
      customerCostCents: null,
      quantity: null,
      result: { position: 3, evidence: "positive" },
    });
    await executeComparisonSide(input);
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });
  it("a recovered finish keeps the successful observation without another provider call", async () => {
    snapshot = comparisonFixture("hosted");
    usage.finish
      .mockRejectedValueOnce(new ProviderUsagePersistenceError())
      .mockResolvedValue(undefined);
    await executeComparisonSide(input);
    expect(row).toMatchObject({
      status: "completed",
      costCents: 2,
      reason: null,
      result: { position: 3 },
    });
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });
  it("an interrupted claimed side is closed unknown without provider transport", async () => {
    row.status = "claimed";
    await executeComparisonSide(input);
    expect(row.status).toBe("unknown");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("never dispatches an own-key side whose key would come from the environment for a tester", async () => {
    const { OwnProviderKeyRequiredError } = await import(
      "@/lib/providers/execution-extension-errors"
    );
    mocks.ownKey.mockRejectedValue(
      new OwnProviderKeyRequiredError({ capability: "rank_check", provider: "serpapi" }),
    );
    await executeComparisonSide(input);
    expect(mocks.ownKey).toHaveBeenCalledWith(
      expect.objectContaining({ capability: "rank_check", projectId: "project" }),
    );
    expect(row.status).not.toBe("completed");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("changed quotes or revoked write access never start native accounting or transport", async () => {
    mocks.quote.mockResolvedValue({ ...snapshot, text: "changed" });
    await executeComparisonSide(input);
    expect(row.status).toBe("failed");
    expect(mocks.journal).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    row.status = "queued";
    mocks.access.mockRejectedValue(new Error("revoked"));
    await executeComparisonSide(input);
    expect(row).toMatchObject({ status: "failed", reason: "access_or_scope_unavailable" });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
