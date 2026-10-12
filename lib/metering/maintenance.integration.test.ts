import { createMeter } from "@usagekit/meter";
import { expect, test, vi } from "vitest";
import { maintainMeteringReservations } from "./maintenance";
import { input, paidFixture } from "./paid-attempt-test-fixture";

const shared = vi.hoisted(() => ({ runtime: {} as { meter: ReturnType<typeof createMeter> } }));
vi.mock("./runtime", () => ({
  meteringRuntime: async () => shared.runtime,
  meteringNamespace: () => "test",
}));
vi.mock("@/lib/ops/notify", () => ({ notifyOps: vi.fn() }));
test("bounded public expiry resumes after process loss and never releases possible paid acceptance", async () => {
  const f = await paidFixture();
  try {
    shared.runtime = { meter: createMeter({ store: f.store, clock: f.clock }) };
    for (let i = 0; i < 101; i++)
      expect(await shared.runtime.meter.reserve(input(`reserved:${i}`).reservation)).toMatchObject({
        outcome: "reserved",
      });
    const reserved = await shared.runtime.meter.reserve(input("possible-send").reservation);
    if (reserved.outcome !== "reserved") throw new Error("Missing expiry fixture");
    const grant = await f.store.markDispatchIntent({
      namespace: "test",
      principal: "owner",
      operationId: "possible-send",
      expectedVersion: reserved.operation.version,
      commandId: "intent",
      holder: "worker",
      leaseTtlMs: 1000,
    });
    expect(grant).toMatchObject({ granted: true });
    f.clock.advance(60001);
    vi.stubEnv("METERING_SHADOW", "off");
    expect(await maintainMeteringReservations()).toEqual({ count: 100, hasMore: true });
    await f.restart();
    expect(await maintainMeteringReservations()).toEqual({ count: 1, hasMore: false });
    expect(
      await f.store.getOperation({
        namespace: "test",
        principal: "owner",
        operationId: "possible-send",
      }),
    ).toMatchObject({ state: "dispatch_intended" });
    expect(await maintainMeteringReservations()).toEqual({ count: 0, hasMore: false });
  } finally {
    vi.unstubAllEnvs();
    await f.close();
  }
});
