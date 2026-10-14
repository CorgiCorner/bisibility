import { AuthorizationError } from "@/lib/auth/authorize";
import type { LocalDatabase } from "@/lib/local-monitoring-store/context";
import { definitionSourceFixture } from "@/lib/measurement-definitions/fixtures";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { localResultFixture, resultObservation } from "./fixture";
import { readMonitorPointListings, readMonitorRunResult } from "./read";

const mocked = vi.hoisted(() => ({
  scope: vi.fn(),
  entityRead: vi.fn(),
  binding: vi.fn(),
  receipt: vi.fn(),
  policy: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/local-monitoring-store/access", () => ({ localProjectScope: mocked.scope }));
vi.mock("@/lib/business-location-store/access", () => ({
  businessReadProjectScope: mocked.entityRead,
}));
vi.mock("./binding", () => ({ readLocalResultBinding: mocked.binding }));
vi.mock("@/lib/measurement-definitions/host-policy-snapshot", () => ({
  readHostPolicySnapshot: mocked.policy,
}));
vi.mock("@/lib/local-monitoring-host/read-transaction", () => ({
  readLocalHostRunInTransaction: mocked.receipt,
}));
describe("same snapshot read authority and full retained result DTO", () => {
  beforeEach(() => vi.clearAllMocks());
  function setup() {
    const fixture = localResultFixture(),
      saved = resultObservation(fixture.binding.rows[0]);
    const tx = {
      localMonitorScheduleIntent: {
        findFirst: vi.fn(async () => ({
          id: fixture.binding.occurrence.scheduleIntentId,
          projectId: fixture.binding.run.projectId,
          monitorId: fixture.binding.occurrence.monitorId,
          definitionRevisionId: fixture.binding.revision.id,
          mode: "manual",
          snapshot: null,
          scheduleId: null,
          createdAt: fixture.binding.occurrence.createdAt,
        })),
      },
      observationItem: { count: vi.fn(async () => 3) },
      observationRun: {
        findMany: vi.fn(async () => [saved.observation]),
        findFirst: vi.fn(async () => saved.observation),
      },
      businessMatchDecision: { findMany: vi.fn(async () => saved.decisions) },
      businessIdentityRevision: {
        findFirst: vi.fn(async () => ({ snapshot: { name: "Synthetic business" } })),
      },
    };
    const transaction = vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx));
    const db = { $transaction: transaction } as unknown as LocalDatabase;
    const scope = {
      project: { id: fixture.binding.run.projectId, publicId: "prj_abcdefghijklmnopqrstuvwx" },
    };
    mocked.scope.mockResolvedValue(scope);
    mocked.entityRead.mockResolvedValue(scope);
    mocked.binding.mockResolvedValue(fixture.binding);
    mocked.receipt.mockResolvedValue(fixture.receipt);
    mocked.policy.mockResolvedValue({ state: "unconfigured", policyEpoch: "1", config: null });
    const command = {
      projectId: scope.project.publicId,
      monitorId: "lmn_abcdefghijklmnopqrstuvwx",
      runId: fixture.binding.run.publicId,
      asOf: fixture.now.toISOString(),
    };
    return { ...fixture, saved, tx, db, command, scope, transaction };
  }
  it("reads positive point/table/export DTO from one repeatable snapshot with fresh entity match permission", async () => {
    const f = setup();
    const result = await readMonitorRunResult(f.command, { actor: null }, { db: f.db, now: f.now });
    expect(result.points[0]).toMatchObject({
      position: 1,
      evidence: "positive",
      scopeClass: "coordinate_seed",
    });
    expect(result.protocol.matcher).toBe("business-match-maps-v1");
    expect(f.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "RepeatableRead",
    });
    expect(mocked.entityRead).toHaveBeenCalledWith(
      f.tx,
      { actor: null },
      f.command.projectId,
      "entity_match",
    );
    expect(mocked.receipt).toHaveBeenCalledWith(
      f.tx,
      { projectId: f.command.projectId, runId: f.command.runId },
      f.scope,
    );
    expect(JSON.stringify(result)).not.toMatch(
      /taskIds|acceptedTaskIdsHash|correlationId|costCents|requestPolicy/,
    );
  });
  it("fresh denied permission prevents even retained observation reads", async () => {
    const f = setup();
    mocked.entityRead.mockRejectedValue(new AuthorizationError("forbidden"));
    await expect(
      readMonitorRunResult(f.command, { actor: null }, { db: f.db, now: f.now }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(mocked.binding).not.toHaveBeenCalled();
    expect(f.tx.observationRun.findMany).not.toHaveBeenCalled();
  });
  it("over capacity or incomplete membership fails rather than returning a partial report", async () => {
    const f = setup();
    f.tx.observationItem.count.mockResolvedValue(10001);
    await expect(
      readMonitorRunResult(f.command, { actor: null }, { db: f.db, now: f.now }),
    ).rejects.toThrow();
    expect(f.tx.observationRun.findMany).not.toHaveBeenCalled();
    f.tx.observationItem.count.mockResolvedValue(4);
    await expect(
      readMonitorRunResult(f.command, { actor: null }, { db: f.db, now: f.now }),
    ).rejects.toThrow();
  });
  it("future, ambiguous URL IDs and unrequested fields reject before transactions", async () => {
    const f = setup();
    for (const command of [
      { ...f.command, asOf: new Date(f.now.getTime() + 1).toISOString() },
      { ...f.command, runId: [f.command.runId] },
      { ...f.command, providerTaskId: "foreign" },
    ])
      await expect(
        readMonitorRunResult(command, { actor: null }, { db: f.db, now: f.now }),
      ).rejects.toThrow();
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it("uses the actually configured manual TTL in the reader and export projection", async () => {
    const f = setup(),
      config = definitionSourceFixture().policy.config;
    mocked.policy.mockResolvedValue({ state: "ready", policyEpoch: "8", config });
    const result = await readMonitorRunResult(f.command, { actor: null }, { db: f.db, now: f.now });
    expect(result.points[0].freshness).toBe("stale");
    expect(result).toMatchObject({
      freshnessPolicy: { policyEpoch: "8", basis: "manual_ttl", freshForMs: 12345 },
    });
    expect(result.grids[0].dataCoverage).toBe(0);
    const observedAt = result.points[0].observedAt;
    if (!observedAt || !config) throw new Error("Real retained observation or policy missing");
    mocked.policy.mockResolvedValue({
      state: "ready",
      policyEpoch: "9",
      config: {
        ...config,
        freshness: {
          ...config.freshness,
          manualTtlMs: f.now.getTime() - Date.parse(observedAt) + 1,
        },
      },
    });
    const fresh = await readMonitorRunResult(f.command, { actor: null }, { db: f.db, now: f.now });
    expect(fresh.points[0]).toMatchObject({ observedAt, freshness: "fresh", position: 1 });
    expect(fresh.grids[0].dataCoverage).toBe(1);
  });
  it("returns listing identity and source metadata from the original normalized item only", async () => {
    const f = setup(),
      original = f.saved.observation.items[0],
      listings = await readMonitorPointListings(
        { ...f.command, targetId: f.binding.rows[0].stored.publicId },
        { actor: null },
        { db: f.db, now: f.now },
      );
    expect(listings[0]).toMatchObject({
      cid: "9007199254740993123",
      placeId: "OpaquePlace_A",
      sourcePage: original.sourcePage,
      sourceBlockId: original.sourceBlockId,
      sourceOrdinal: original.sourceOrdinal,
      rankScale: original.rankScale,
    });
    expect(typeof listings[0].cid).toBe("string");
    expect(mocked.receipt).not.toHaveBeenCalled();
  });
});
