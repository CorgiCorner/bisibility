import { prisma } from "@/lib/db/prisma";
import { operationKey } from "@/lib/local-monitoring/target-key";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { releaseExpiredUnsentMonitorItem } from "./unsent";

const f = vi.hoisted(() => ({
  scope: vi.fn(),
  claim: vi.fn(),
  owner: vi.fn(),
  custody: vi.fn(),
  cancel: vi.fn(),
  discard: vi.fn(),
  audit: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  native: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        localMeasurementRunItem: { updateMany: f.update },
        localMeasurementTargetOwner: { deleteMany: f.remove },
        $queryRaw: f.native,
      }),
  },
}));
vi.mock("@/lib/local-monitoring-store/item-scope", () => ({ localItemScope: f.scope }));
vi.mock("./repository", () => ({ assertMonitorClaim: f.claim }));
vi.mock("@/lib/local-monitoring-store/ownership", () => ({ assertLocalTargetOwner: f.owner }));
vi.mock("@/lib/local-monitoring-store/custody", () => ({ assertLocalCustody: f.custody }));
vi.mock("@/lib/provider-usage/admission-extension", () => ({ ownAdmission: { cancel: f.cancel } }));
vi.mock("@/lib/provider-usage/byok-evidence", () => ({ discardByokEvidence: f.discard }));
vi.mock("@/lib/local-monitoring-store/audit", () => ({ auditLocal: f.audit }));
const now = new Date("2026-10-12T12:00:00Z"),
  claim = { id: "job", token: "token", generation: 1 },
  ref = {
    projectId: "prj_aaaaaaaaaaaaaaaaaaaaaaaa",
    runId: "lmr_aaaaaaaaaaaaaaaaaaaaaaaa",
    targetId: "lmt_aaaaaaaaaaaaaaaaaaaaaaaa",
  } as const;
const base = {
  key: operationKey({
    projectId: "project",
    operation: "local_scan_submit",
    idempotencyKey: "key",
  }),
  scope: { projectId: "project", operation: "local_scan_submit" as const, idempotencyKey: "key" },
  targetKey: "target",
  quoteHash: "quote",
  provider: "provider",
  adapterVersion: "adapter",
  providerPriceVersion: "price",
  version: 0,
  status: "claimed" as const,
  attemptId: null,
  outcome: null,
  settlementRecorded: false,
  cancellationRequested: false,
  collectedEvidenceId: null,
};
beforeEach(() => {
  vi.resetAllMocks();
  f.scope.mockResolvedValue({
    scope: { project: { id: "project" } },
    item: { id: "item", targetId: "target", projectId: "project" },
    record: base,
  });
  f.owner.mockResolvedValue({ workerExpiresAt: new Date(now.getTime() - 1) });
  f.custody.mockResolvedValue("original-attempt");
  f.update.mockResolvedValue({ count: 1 });
  f.native.mockResolvedValue([{ fencedAt: null }]);
});
describe("worker recovery of an admitted but unsent original", () => {
  it("does not release a live first-send owner", async () => {
    f.owner.mockResolvedValue({ workerExpiresAt: new Date(now.getTime() + 1) });
    expect(
      await releaseExpiredUnsentMonitorItem(ref, { actor: { id: "actor" } }, claim, prisma, now),
    ).toBe(false);
    expect(f.cancel).not.toHaveBeenCalled();
  });
  it.each(["accepted", "rejected"])("never cancels %s from expiry alone", async (status) => {
    f.scope.mockResolvedValue({
      scope: { project: { id: "project" } },
      item: { id: "item", targetId: "target" },
      record: { ...base, status, attemptId: "original-attempt" },
    });
    expect(
      await releaseExpiredUnsentMonitorItem(ref, { actor: { id: "actor" } }, claim, prisma, now),
    ).toBe(false);
    expect(f.cancel).not.toHaveBeenCalled();
    expect(f.remove).not.toHaveBeenCalled();
  });
  it("releases an old possible-send marker only after actual unfenced cancellation", async () => {
    f.scope.mockResolvedValue({
      scope: { project: { id: "project" } },
      item: { id: "item", targetId: "target", projectId: "project" },
      record: { ...base, status: "unknown_acceptance", attemptId: "original-attempt", version: 1 },
    });
    expect(
      await releaseExpiredUnsentMonitorItem(ref, { actor: { id: "actor" } }, claim, prisma, now),
    ).toBe(true);
    expect(f.update.mock.calls[0][0].data.record).toMatchObject({
      status: "cancelled",
      attemptId: "original-attempt",
      version: 2,
    });
    expect(f.cancel.mock.invocationCallOrder[0]).toBeLessThan(f.update.mock.invocationCallOrder[0]);
  });
  it("never treats a historical marker as unfenced proof", async () => {
    f.scope.mockResolvedValue({
      scope: { project: { id: "project" } },
      item: { id: "item", targetId: "target", projectId: "project" },
      record: { ...base, status: "unknown_acceptance", attemptId: "original-attempt" },
    });
    f.cancel.mockRejectedValue(new Error("already fenced"));
    await expect(
      releaseExpiredUnsentMonitorItem(ref, { actor: { id: "actor" } }, claim, prisma, now),
    ).rejects.toThrow("fenced");
    expect(f.update).not.toHaveBeenCalled();
    expect(f.discard).not.toHaveBeenCalled();
    expect(f.remove).not.toHaveBeenCalled();
  });
  it("keeps a native possible-send on reconciliation instead of cancel", async () => {
    f.scope.mockResolvedValue({
      scope: { project: { id: "project" } },
      item: { id: "item", targetId: "target", projectId: "project" },
      record: { ...base, status: "unknown_acceptance", attemptId: "original-attempt" },
    });
    f.native.mockResolvedValue([{ fencedAt: now }]);
    expect(
      await releaseExpiredUnsentMonitorItem(ref, { actor: { id: "actor" } }, claim, prisma, now),
    ).toBe(false);
    expect(f.cancel).not.toHaveBeenCalled();
    expect(f.remove).not.toHaveBeenCalled();
  });
  it("preserves owner and evidence when canonical Meter rejects an unseen fence", async () => {
    f.cancel.mockRejectedValue(new Error("already fenced"));
    await expect(
      releaseExpiredUnsentMonitorItem(ref, { actor: { id: "actor" } }, claim, prisma, now),
    ).rejects.toThrow("fenced");
    expect(f.update).not.toHaveBeenCalled();
    expect(f.discard).not.toHaveBeenCalled();
    expect(f.remove).not.toHaveBeenCalled();
  });
  it("only releases the original unfenced attempt then retains a cancelled record", async () => {
    expect(
      await releaseExpiredUnsentMonitorItem(ref, { actor: { id: "actor" } }, claim, prisma, now),
    ).toBe(true);
    expect(f.cancel).toHaveBeenCalledWith(expect.anything(), ["original-attempt"]);
    expect(f.update.mock.calls[0][0].data.record.status).toBe("cancelled");
    expect(f.discard).toHaveBeenCalledWith(expect.anything(), ["original-attempt"]);
    expect(f.remove).toHaveBeenCalledTimes(1);
    expect(f.cancel.mock.invocationCallOrder[0]).toBeLessThan(f.remove.mock.invocationCallOrder[0]);
  });
});
