import { prisma } from "@/lib/db/prisma";
import { operationKey } from "@/lib/local-monitoring/target-key";
import { readLocalHostRun } from "@/lib/local-monitoring-host/read";
import { LocalMeasurementConflictError } from "@/lib/local-monitoring-store/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({
  scope: vi.fn(),
  custody: vi.fn(),
  financial: vi.fn(),
  evidence: vi.fn(),
  paid: vi.fn(),
  operation: vi.fn(),
  meter: vi.fn(),
  owners: vi.fn(),
}));
const record = {
  key: operationKey({
    projectId: "project",
    operation: "local_scan_submit",
    idempotencyKey: "key",
  }),
  version: 1,
  scope: { projectId: "project", operation: "local_scan_submit", idempotencyKey: "key" },
  targetKey: "target-key",
  quoteHash: "quote",
  provider: "dataforseo",
  adapterVersion: "adapter",
  providerPriceVersion: "price",
  status: "cancelled",
  attemptId: null,
  outcome: null,
  settlementRecorded: false,
  cancellationRequested: true,
  collectedEvidenceId: null,
};
const item = {
  id: "item",
  targetId: "target",
  version: 1,
  operationKey: record.key,
  record,
  projectId: "project",
  namespace: "namespace",
  connectionId: "connection",
  provider: "dataforseo",
  correlationId: "correlation",
  credentialVersion: "credential",
  preparedAttemptId: "attempt",
  preparedLeaseId: "lease",
  requestHash: "hash",
};
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        localMeasurementRun: {
          findFirst: async () => ({
            id: "run",
            publicId: "lmr_abcdefghijklmnopqrstuvwx",
            version: 1,
            cancellationRequested: true,
            expectedTargetKeys: ["target-key"],
          }),
        },
        localMeasurementRunItem: { findMany: async () => [item] },
        localMeasurementTarget: {
          findMany: async () => [
            { id: "target", publicId: "lmt_abcdefghijklmnopqrstuvwx", targetKey: "target-key" },
          ],
        },
        localMeasurementTargetOwner: { findMany: f.owners },
        meteringUsageEvidence: { findFirst: f.evidence },
        $queryRaw: f.paid,
      }),
  },
}));
vi.mock("@/lib/local-monitoring-store/access", () => ({ localProjectScope: f.scope }));
vi.mock("@/lib/local-monitoring-store/custody", () => ({ assertLocalCustody: f.custody }));
vi.mock("@/lib/local-monitoring-store/acceptance-proof", () => ({
  localCanonicalFinancialState: f.financial,
}));
vi.mock("@/lib/metering/transaction-meter", () => ({
  createTransactionMeter: f.meter,
  readPaidOperation: f.operation,
  PaidOperationUnavailableError: class extends Error {},
}));
const evidence = {
  principal: "historical-owner",
  estimate: { credentialVersion: "credential" },
  measurementStatus: "unknown",
  receipt: null,
  providerRequestId: null,
  canonicalId: null,
};
const paid = { leaseId: "lease", version: "credential", feature: "local_scan", fencedAt: null };
const input = { projectId: "prj_abcdefghijklmnopqrstuvwx", runId: "lmr_abcdefghijklmnopqrstuvwx" };
beforeEach(() => {
  vi.resetAllMocks();
  f.scope.mockResolvedValue({ project: { id: "project" } });
  f.owners.mockResolvedValue([]);
  f.custody.mockRejectedValue(new LocalMeasurementConflictError());
  f.evidence.mockResolvedValue(evidence);
  f.paid.mockResolvedValue([paid]);
  f.operation.mockResolvedValue({ state: "released" });
});
describe("retained cancelled-unsent host read", () => {
  it("reads genuine released state through exact historical principal without active BYOK identity", async () => {
    const result = await readLocalHostRun(input, { actor: { id: "viewer" } }, prisma);
    expect(result.items[0]).toMatchObject({
      status: "cancelled",
      financialState: "released",
      ownerRetained: false,
      resolution: "cancelled",
    });
    expect(f.operation).toHaveBeenCalledWith(undefined, {
      namespace: "namespace",
      principal: "historical-owner",
      operationId: "attempt",
    });
    expect(f.custody).not.toHaveBeenCalled();
  });
  it.each([
    { fencedAt: new Date() },
    { leaseId: "foreign" },
    { version: "foreign" },
    { feature: "rank_check" },
  ])("refuses invalid retained paid binding %j", async (change) => {
    f.paid.mockResolvedValue([{ ...paid, ...change }]);
    await expect(
      readLocalHostRun(input, { actor: { id: "viewer" } }, prisma),
    ).rejects.toBeInstanceOf(LocalMeasurementConflictError);
    expect(f.operation).not.toHaveBeenCalled();
  });
  it("does not project a live reservation as released", async () => {
    f.operation.mockResolvedValue({ state: "reserved" });
    await expect(
      readLocalHostRun(input, { actor: { id: "viewer" } }, prisma),
    ).rejects.toBeInstanceOf(LocalMeasurementConflictError);
  });
  it("rejects evidence with provider receipt", async () => {
    f.evidence.mockResolvedValue({ ...evidence, receipt: { costCents: "0.06" } });
    await expect(
      readLocalHostRun(input, { actor: { id: "viewer" } }, prisma),
    ).rejects.toBeInstanceOf(LocalMeasurementConflictError);
    expect(f.operation).not.toHaveBeenCalled();
  });
  it("keeps active custody path when no discarded evidence exists", async () => {
    f.evidence.mockResolvedValue(null);
    f.custody.mockResolvedValue("attempt");
    f.financial.mockResolvedValue("reserved");
    const result = await readLocalHostRun(input, { actor: { id: "viewer" } }, prisma);
    expect(result.items[0].financialState).toBe("reserved");
    expect(f.operation).not.toHaveBeenCalled();
  });
  it("reauthorizes every host read before historical proof", async () => {
    f.scope.mockRejectedValue(new Error("forbidden"));
    await expect(readLocalHostRun(input, { actor: { id: "foreign" } }, prisma)).rejects.toThrow(
      "forbidden",
    );
    expect(f.evidence).not.toHaveBeenCalled();
  });
});
