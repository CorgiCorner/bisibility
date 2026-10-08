import { createMeter } from "@usagekit/meter";
import { createManualClock, createMemoryStore } from "@usagekit/store";
import { describe, expect, it, vi } from "vitest";
import { allocationBudgets, type UsageEntry } from "./mapping";
import { createShadowEngine, type ShadowHandoff } from "./shadow-engine";

const entry: UsageEntry = {
  id: "receipt1",
  ownerId: "owner",
  projectId: "project",
  connectionId: "conn",
  provider: "search",
  feature: "rank_check",
  source: "api",
  createdAt: new Date("2026-09-23T12:00:00Z"),
  costCents: "1.0000",
  usageQuantity: "1",
  measurementStatus: "recorded",
  cached: false,
  failed: false,
  platformPoolId: "provider-account",
  providerCredentialVersion: "credential-v1",
  providerCostOwner: "platform-payer",
};
function fixture() {
  const clock = createManualClock();
  const store = createMemoryStore({
    clock,
    budgets: allocationBudgets(
      "test",
      { id: "conn", unit: "cents", app: "0", programmatic: "0" },
      1,
    ),
  });
  const meter = createMeter({
    store,
    clock,
    resolveOwnership: async (scope) => ({
      kind: "principal",
      namespace: scope.namespace,
      principal: "owner",
    }),
  });
  const sink = vi.fn();
  const failure = vi.fn();
  const persisted = new Map<string, ShadowHandoff>();
  const handoffs = {
    save: vi.fn(async (_entry: UsageEntry, handoff: ShadowHandoff) => {
      persisted.set(handoff.operationId, handoff);
    }),
    load: vi.fn(async (value: UsageEntry) => persisted.get(value.id)),
    clear: vi.fn(async (value: UsageEntry, leaseId: string) => {
      if (persisted.get(value.id)?.leaseId === leaseId) persisted.delete(value.id);
    }),
  };
  return {
    clock,
    meter,
    store,
    sink,
    failure,
    handoffs,
    engine: createShadowEngine({ meter, clock, namespace: "test", sink, failure, handoffs }),
  };
}
describe("non-authoritative shadow accounting", () => {
  it("preserves an import and fails closed without a trusted late-proof handler", async () => {
    const f = fixture();
    const partial: UsageEntry = {
      ...entry,
      providerRequestId: "shadow-native",
      costCents: "0.6250",
      usageQuantity: null,
      measurementStatus: "unknown",
      costMeasurement: "recorded",
      quantityMeasurement: "unknown",
    };
    await f.engine.begin(partial, { cents: "1", units: "1" });
    await f.engine.record(partial);
    const imported = await f.store.importBilling({
      scope: { namespace: "test", principal: "owner", connection: "conn" },
      provider: "search",
      fileHash: "a".repeat(64),
      window: { from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" },
      expectedPreviousImportId: null,
      attribution: { fundingSource: "byok", costOwner: "owner" },
      lines: [
        {
          providerRequestId: "shadow-native",
          occurredAt: partial.createdAt.toISOString(),
          cost: { units: 9000n, currency: "USD" },
        },
      ],
    });
    expect(imported.outcome).toBe("imported");
    await f.engine.record({
      ...partial,
      proofVersion: 1,
      usageQuantity: "1.000000",
      quantityMeasurement: "recorded",
      measurementStatus: "recorded",
    });
    const op = await f.store.getOperation({
      namespace: "test",
      principal: "owner",
      operationId: entry.id,
    });
    expect(op?.state).toBe("pending");
    expect(op?.receipts.at(-1)?.cost.money?.units).toBe(9000n);
    expect(op?.receipts.at(-1)?.measurements.find((m) => m.unit === "cents")?.quantity?.value).toBe(
      9000n,
    );
    expect(op?.receipts.at(-1)?.measurements.find((m) => m.unit === "units")?.quantity).toBeNull();
    expect(f.failure).toHaveBeenCalledWith(expect.objectContaining({ proofVersion: 1 }), "record");
  });
  it("corrects a measured cost while its independent quantity remains unknown", async () => {
    const f = fixture();
    const partial = {
      ...entry,
      measurementStatus: "unknown",
      costMeasurement: "recorded" as const,
      quantityMeasurement: "unknown" as const,
      usageQuantity: null,
      costCents: "0.6250",
    };
    await f.engine.begin(partial, { cents: "1", units: "1" });
    await f.engine.record(partial);
    await f.engine.record({ ...partial, costCents: "0.9000" });
    const op = await f.store.getOperation({
      namespace: "test",
      principal: "owner",
      operationId: entry.id,
    });
    expect(op?.receipts.at(-1)?.cost.money?.units).toBe(9000n);
    expect(op?.receipts.at(-1)?.measurements.find((m) => m.unit === "units")).toEqual({
      unit: "units",
      certainty: "unknown",
      quantity: null,
    });
    expect(op?.state).toBe("pending");
    expect(f.failure).not.toHaveBeenCalled();
  });
  it("records warn as exceeded but settles full cost exactly once", async () => {
    const f = fixture();
    await f.engine.begin(entry, { cents: "1", units: "1" });
    await f.engine.record(entry);
    await f.engine.record(entry);
    const operation = await f.store.getOperation({
      namespace: "test",
      principal: "owner",
      operationId: entry.id,
    });
    expect(operation?.state).toBe("settled");
    expect(operation?.receipts).toHaveLength(1);
    expect(f.sink).toHaveBeenCalledWith(
      expect.objectContaining({ legacy: "allowed", meter: "exceeded" }),
    );
  });
  it("compares a denied call without creating an operation or dispatch", async () => {
    const f = fixture();
    const reserve = vi.spyOn(f.meter, "reserve");
    const release = vi.spyOn(f.meter, "releaseUndispatched");
    await f.engine.compare(entry, { cents: "1", units: "1" }, "blocked");
    expect(reserve).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
    expect(f.sink).toHaveBeenCalledWith(
      expect.objectContaining({ legacy: "blocked", meter: "exceeded" }),
    );
    expect(
      await f.store.getOperation({
        namespace: "test",
        principal: "owner",
        operationId: `admission:${entry.id}`,
      }),
    ).toBeNull();
  });
  it("maps a hosted admission denial to wallet_blocked with platform funding", async () => {
    const f = fixture();
    const hosted = { ...entry, credentialSource: "hosted" as const };
    const reserve = vi.spyOn(f.meter, "reserve");
    await f.engine.compare(hosted, { cents: "1", units: "1" }, "wallet_blocked");
    expect(reserve).not.toHaveBeenCalled();
    expect(f.sink).toHaveBeenCalledWith(
      expect.objectContaining({
        legacy: "wallet_blocked",
        funding: "platform",
        meter: "exceeded",
      }),
    );
    expect(
      await f.store.getOperation({
        namespace: "test",
        principal: "owner",
        operationId: `admission:${entry.id}`,
      }),
    ).toBeNull();
  });
  it("reserves hosted operations with platform funding and the shared key pool", async () => {
    const f = fixture();
    const hosted = { ...entry, credentialSource: "hosted" as const };
    await f.engine.begin(hosted, { cents: "1", units: "1" });
    const operation = await f.store.getOperation({
      namespace: "test",
      principal: "owner",
      operationId: entry.id,
    });
    expect(operation?.fundingSource).toBe("platform");
    expect(operation?.platformPools).toEqual(["provider-account"]);
    expect(operation?.costOwner).toBe("platform-payer");
  });
  it("unknown stays pending and later evidence corrects it after process loss", async () => {
    const f = fixture();
    await f.engine.begin(entry, { cents: "1", units: "1" });
    await f.engine.record({ ...entry, measurementStatus: "unknown", usageQuantity: null });
    expect(
      (await f.store.getOperation({ namespace: "test", principal: "owner", operationId: entry.id }))
        ?.state,
    ).toBe("pending");
    await f.engine.record(entry);
    const op = await f.store.getOperation({
      namespace: "test",
      principal: "owner",
      operationId: entry.id,
    });
    expect(op?.state).toBe("settled");
    expect(op?.receipts[1]?.supersedes).toBe(op?.receipts[0]?.id);
  });
  it("does not replace a measured receipt with later unknown evidence", async () => {
    const f = fixture();
    await f.engine.begin(entry, { cents: "1", units: "1" });
    await f.engine.record(entry);
    await f.engine.record({ ...entry, measurementStatus: "unknown", usageQuantity: null });
    const op = await f.store.getOperation({
      namespace: "test",
      principal: "owner",
      operationId: entry.id,
    });
    expect(op?.state).toBe("settled");
    expect(op?.receipts).toHaveLength(1);
  });
  it("keeps a measured cost when a pending partial receipt is followed by unknown evidence", async () => {
    const f = fixture();
    await f.engine.begin(entry, { cents: "1", units: "1" });
    await f.engine.record({ ...entry, unit: "units", usageQuantity: null });
    await f.engine.record({
      ...entry,
      unit: "units",
      measurementStatus: "unknown",
      usageQuantity: null,
    });
    const op = await f.store.getOperation({
      namespace: "test",
      principal: "owner",
      operationId: entry.id,
    });
    expect(op?.state).toBe("pending");
    expect(op?.receipts).toHaveLength(1);
    expect(op?.receipts[0]?.cost.certainty).toBe("measured");
  });
  it("keeps a known unit when a later receipt omits that dimension", async () => {
    const f = fixture();
    await f.engine.begin(entry, { cents: "1", units: "1" });
    await f.engine.record(entry);
    await f.engine.record({ ...entry, unit: "cents", costCents: "2.0000", usageQuantity: null });
    const op = await f.store.getOperation({
      namespace: "test",
      principal: "owner",
      operationId: entry.id,
    });
    expect(op?.state).toBe("settled");
    expect(op?.receipts).toHaveLength(1);
    expect(op?.receipts[0]?.measurements.find((m) => m.unit === "units")?.certainty).toBe(
      "measured",
    );
  });
  it("catches all shadow exceptions, including sink failures", async () => {
    const f = fixture();
    f.sink.mockRejectedValue(new Error("sink unavailable"));
    await expect(
      f.engine.compare(entry, { cents: "1", units: "1" }, "wallet_blocked"),
    ).resolves.toBeUndefined();
    expect(f.failure).toHaveBeenCalled();
  });
  it("settles recorded legacy evidence after intent fails behind a successful reservation", async () => {
    const f = fixture();
    const meter = {
      ...f.meter,
      markDispatchIntent: vi
        .fn(f.meter.markDispatchIntent)
        .mockRejectedValueOnce(new Error("intent unavailable")),
    };
    const engine = createShadowEngine({ ...f, meter, namespace: "test" });
    await engine.begin(entry, { cents: "1", units: "1" });
    expect(
      (await f.store.getOperation({ namespace: "test", principal: "owner", operationId: entry.id }))
        ?.state,
    ).toBe("reserved");
    await engine.record(entry);
    expect(
      (await f.store.getOperation({ namespace: "test", principal: "owner", operationId: entry.id }))
        ?.state,
    ).toBe("settled");
  });
  it("leaves an expired reserved operation released as an exception", async () => {
    const f = fixture();
    const meter = {
      ...f.meter,
      markDispatchIntent: vi
        .fn(f.meter.markDispatchIntent)
        .mockRejectedValueOnce(new Error("intent unavailable")),
    };
    const engine = createShadowEngine({ ...f, meter, namespace: "test" });
    await engine.begin(entry, { cents: "1", units: "1" });
    f.clock.advance(3600001);
    await engine.record(entry);
    const op = await f.store.getOperation({
      namespace: "test",
      principal: "owner",
      operationId: entry.id,
    });
    expect(op?.state).toBe("released");
    expect(op?.receipts).toHaveLength(0);
    expect(f.failure).toHaveBeenCalledWith(entry, "record");
  });
});

describe("queued shadow lease handoff", () => {
  it("hydrates a replay only from the matching durable active handoff", async () => {
    const f = fixture();
    await f.engine.begin(entry, { cents: "1", units: "1" });
    const original = f.engine.handoff(entry.id);
    const restarted = createShadowEngine({ ...f, namespace: "test" });
    await restarted.begin(entry, { cents: "1", units: "1" });
    expect(restarted.handoff(entry.id)?.leaseId).toBe(original?.leaseId);
    expect(f.failure).not.toHaveBeenCalled();
  });
  it("resumes a queued operation from the durable handoff when its task payload is missing", async () => {
    const f = fixture();
    await f.engine.begin(entry, { cents: "1", units: "1" }, 86400000);
    const restarted = createShadowEngine({ ...f, namespace: "test" });
    await restarted.resume(entry, undefined);
    expect(restarted.handoff(entry.id)?.leaseId).toBe(f.engine.handoff(entry.id)?.leaseId);
    expect(f.failure).not.toHaveBeenCalled();
  });
  it("settles evidence on a fresh process while the original lease is active", async () => {
    const f = fixture();
    await f.engine.begin(entry, { cents: "1", units: "1" });
    const otherProcess = createShadowEngine({ ...f, namespace: "test" });
    await otherProcess.record(entry);
    expect(f.handoffs.load).toHaveBeenCalledWith(entry);
    expect(f.failure).not.toHaveBeenCalled();
    expect(
      (await f.store.getOperation({ namespace: "test", principal: "owner", operationId: entry.id }))
        ?.state,
    ).toBe("settled");
  });

  it("carries the dispatch lease to another worker and renews before recording", async () => {
    const f = fixture();
    await f.engine.begin(entry, { cents: "1", units: "1" }, 86400000);
    const payload = f.engine.handoff(entry.id);
    expect(payload).toMatchObject({ operationId: entry.id, kind: "lease" });
    const worker = createShadowEngine({ ...f, namespace: "test" });
    await worker.resume(entry, payload);
    await worker.record(entry);
    expect(f.failure).not.toHaveBeenCalled();
    expect(
      (await f.store.getOperation({ namespace: "test", principal: "owner", operationId: entry.id }))
        ?.state,
    ).toBe("settled");
  });
  it("claims an expired handoff for evidence only and fences the former worker", async () => {
    const f = fixture();
    await f.engine.begin(entry, { cents: "1", units: "1" }, 1000);
    const payload = f.engine.handoff(entry.id);
    f.clock.advance(1001);
    const worker = createShadowEngine({ ...f, namespace: "test" });
    await worker.resume(entry, payload);
    expect(worker.handoff(entry.id)?.kind).toBe("recovery");
    await f.engine.begin(entry, { cents: "1", units: "1" });
    expect(f.engine.handoff(entry.id)?.leaseId).not.toBe(worker.handoff(entry.id)?.leaseId);
    await f.engine.record(entry);
    expect(f.failure).toHaveBeenCalledWith(entry, "record");
    await worker.record(entry);
    expect(
      (await f.store.getOperation({ namespace: "test", principal: "owner", operationId: entry.id }))
        ?.state,
    ).toBe("settled");
  });
  it("rejects a handoff belonging to another operation without changing its lease", async () => {
    const f = fixture();
    await f.engine.begin(entry, { cents: "1", units: "1" });
    const before = await f.store.getOperation({
      namespace: "test",
      principal: "owner",
      operationId: entry.id,
    });
    const worker = createShadowEngine({ ...f, namespace: "test" });
    const payload = f.engine.handoff(entry.id);
    if (!payload) throw new Error("Missing handoff");
    await worker.resume(entry, { ...payload, operationId: "another" });
    expect(f.failure).toHaveBeenCalledWith(entry, "resume");
    expect(
      await f.store.getOperation({ namespace: "test", principal: "owner", operationId: entry.id }),
    ).toEqual(before);
  });
});
