import { prisma } from "@/lib/db/prisma";
import { MapsResultPendingError } from "@/lib/providers/local-search/maps-result";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { continueMonitorItem } from "./continuation-item";

const f = vi.hoisted(() => ({
  scope: vi.fn(),
  guard: vi.fn(),
  owner: vi.fn(),
  claim: vi.fn(),
  collect: vi.fn(),
  resolve: vi.fn(),
  reconcile: vi.fn(),
  release: vi.fn(),
  unsent: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        localMeasurementTargetOwner: { findFirst: f.owner },
        localMeasurementPoint: { findFirstOrThrow: async () => ({ point: {} }) },
      }),
  },
}));
vi.mock("@/lib/local-monitoring-store/item-scope", () => ({ localItemScope: f.scope }));
vi.mock("./repository", () => ({ assertMonitorClaim: f.guard, MONITOR_WORKER_LEASE_MS: 300000 }));
vi.mock("@/lib/local-monitoring-store/continuation-lease", () => ({
  claimLocalContinuation: f.claim,
}));
vi.mock("@/lib/local-monitoring-store/collect-item", () => ({
  collectLocalMeasurementItem: f.collect,
}));
vi.mock("@/lib/local-monitoring-host/maps-collection", () => ({
  resolveMapsCollectionPorts: f.resolve,
}));
vi.mock("@/lib/local-monitoring-host/reconcile", () => ({ reconcileLocalHostItem: f.reconcile }));
vi.mock("@/lib/local-monitoring-store/point", () => ({ retainedLocalPoint: () => ({}) }));
vi.mock("./continuation-lease-release", () => ({ releaseMonitorContinuationLease: f.release }));
vi.mock("./unsent", () => ({ releaseExpiredUnsentMonitorItem: f.unsent }));
const ref = {
    projectId: "prj_aaaaaaaaaaaaaaaaaaaaaaaa",
    runId: "lmr_aaaaaaaaaaaaaaaaaaaaaaaa",
    targetId: "lmt_aaaaaaaaaaaaaaaaaaaaaaaa",
  } as const,
  context = { actor: { id: "actor" } },
  claim = { id: "job", token: "token", generation: 1 },
  now = new Date("2026-10-12");
const target = {
  version: 1,
  projectId: "project",
  keywordId: "keyword",
  keywordRevision: "1",
  pointRevision: "point",
  engine: "google",
  surface: "maps",
  resultKind: "map_listing",
  rankScale: "maps_organic",
  language: "en",
  device: "desktop",
  operatingSystem: null,
  cutoff: 20,
  zoom: 12,
  policyRevision: "revision",
};
const value = {
  scope: { project: { id: "project" } },
  item: {},
  target: { pointId: "point", target },
  record: {
    status: "accepted",
    settlementRecorded: true,
    collectedEvidenceId: null,
    outcome: { taskIds: ["original-task"] },
  },
};
beforeEach(() => {
  vi.resetAllMocks();
  f.scope.mockResolvedValue(value);
  f.guard.mockResolvedValue({ collectionDeadline: new Date("2999-01-01") });
  f.owner.mockResolvedValue({ version: 2, workerExpiresAt: null });
  f.claim.mockResolvedValue({ token: "lease" });
  f.resolve.mockResolvedValue({ adapter: {}, normalizer: {}, clock: () => now });
});
describe("retained Local collection", () => {
  it("polls only the original accepted task and releases the completed continuation lease", async () => {
    expect(await continueMonitorItem(ref, context, claim, prisma, () => now)).toBe("progress");
    expect(f.collect).toHaveBeenCalledTimes(1);
    expect(f.resolve.mock.calls[0][1].record.outcome.taskIds).toEqual(["original-task"]);
    expect(f.claim.mock.calls[0][0].purpose).toBe("collect");
    expect(f.reconcile).not.toHaveBeenCalled();
    expect(f.release).toHaveBeenCalledTimes(1);
  });
  it("retries only typed provider-pending GET responses", async () => {
    f.collect.mockRejectedValue(new MapsResultPendingError(40602));
    expect(await continueMonitorItem(ref, context, claim, prisma, () => now)).toBe("pending");
    expect(f.release).toHaveBeenCalledTimes(1);
  });
  it("does not label malformed data as a retryable pending response", async () => {
    f.collect.mockRejectedValue(new Error("scope mismatch"));
    await expect(continueMonitorItem(ref, context, claim, prisma, () => now)).rejects.toThrow(
      "scope mismatch",
    );
    expect(f.release).toHaveBeenCalledTimes(1);
  });
  it("retains unknown acceptance while collecting a proven accepted subset", async () => {
    f.scope.mockResolvedValue({
      ...value,
      record: { ...value.record, status: "unknown_acceptance" },
    });
    expect(await continueMonitorItem(ref, context, claim, prisma, () => now)).toBe("progress");
    expect(f.claim.mock.calls[0][0].purpose).toBe("collect");
    expect(f.resolve.mock.calls[0][1].record.status).toBe("unknown_acceptance");
  });
  it("does not extend the retained collection window or buy replacements", async () => {
    f.guard.mockResolvedValue({ collectionDeadline: new Date(0) });
    expect(await continueMonitorItem(ref, context, claim, prisma, () => now)).toBe("blocked");
    expect(f.resolve).not.toHaveBeenCalled();
    expect(f.collect).not.toHaveBeenCalled();
  });
  it("routes claimed work to proven-unsent cleanup without provider access", async () => {
    f.scope.mockResolvedValue({
      ...value,
      record: {
        status: "claimed",
        attemptId: null,
        outcome: null,
        settlementRecorded: false,
        collectedEvidenceId: null,
      },
    });
    f.unsent.mockResolvedValue(true);
    expect(await continueMonitorItem(ref, context, claim, prisma, () => now)).toBe("progress");
    expect(f.resolve).not.toHaveBeenCalled();
    expect(f.collect).not.toHaveBeenCalled();
    expect(f.claim).not.toHaveBeenCalled();
  });
  it("routes an old unfenced marker to native cleanup", async () => {
    f.scope.mockResolvedValue({
      ...value,
      record: {
        status: "unknown_acceptance",
        attemptId: "original",
        outcome: null,
        settlementRecorded: false,
        collectedEvidenceId: null,
      },
    });
    f.unsent.mockResolvedValue(true);
    expect(await continueMonitorItem(ref, context, claim, prisma, () => now)).toBe("progress");
    expect(f.claim).not.toHaveBeenCalled();
    expect(f.reconcile).not.toHaveBeenCalled();
  });
  it("reconciles the same native fenced attempt when no transport outcome survived", async () => {
    f.scope.mockResolvedValue({
      ...value,
      record: {
        status: "unknown_acceptance",
        attemptId: "original",
        outcome: null,
        settlementRecorded: false,
        collectedEvidenceId: null,
      },
    });
    f.unsent.mockResolvedValue(false);
    f.reconcile.mockResolvedValue({ status: "needs_provider_evidence" });
    expect(await continueMonitorItem(ref, context, claim, prisma, () => now)).toBe("blocked");
    expect(f.claim.mock.calls[0][0].purpose).toBe("reconcile");
    expect(f.collect).not.toHaveBeenCalled();
  });
});
