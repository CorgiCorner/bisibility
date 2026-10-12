import { expect, test, vi } from "vitest";
import { disposablePostgres } from "./disposable-postgres-test";
import { command, receipt, ref, request } from "./test-data";
import { fixture } from "./test-fixture";

test("an actual database crash preserves receipt totals, recovery fencing and a durable cursor", async () => {
  const server = await disposablePostgres();
  vi.stubEnv("METERING_TEST_DATABASE_URL", server.url);
  try {
    const f = await fixture();
    try {
      for (const id of ["a", "b"]) {
        const r = await f.store.reserve({ ...request(id), provider: id });
        if (r.outcome !== "reserved") throw new Error("Reservation failed");
        const g = await f.store.markDispatchIntent({
          ...command(r.operation),
          holder: "worker",
          leaseTtlMs: 1000,
        });
        if (!("granted" in g) || !g.granted) throw new Error("Intent failed");
        await f.store.settle({
          ...command(g.operation),
          authority: { kind: "lease", leaseId: g.lease.leaseId },
          receipt: receipt(),
        });
      }
      const reserved = await f.store.reserve(request("pending"));
      if (reserved.outcome !== "reserved") throw new Error("Reservation failed");
      await f.store.markDispatchIntent({
        ...command(reserved.operation),
        holder: "lost-worker",
        leaseTtlMs: 1000,
      });
      const query = {
        scope: { kind: "namespace" as const, namespace: "test" },
        from: "2026-09-01T00:00:00Z",
        to: "2026-10-01T00:00:00Z",
        groupBy: ["provider" as const],
        units: ["requests"],
        limit: 1,
      };
      const first = await f.store.aggregate(query);
      expect(first.nextCursor).toBeTruthy();
      await f.client().$disconnect();
      await server.restart();
      const reopened = await f.restart();
      const second = await reopened.aggregate({ ...query, cursor: first.nextCursor });
      expect(second.watermark).toBe(first.watermark);
      expect(second.rows[0]?.cost.money?.units).toBe(1n);
      f.clock.advance(2000);
      const recovery = await reopened.claimForRecovery({
        ...ref(request("pending")),
        holder: "recovery",
        leaseTtlMs: 1000,
      });
      if (!("claimed" in recovery) || !recovery.claimed) throw new Error("Recovery failed");
      expect(
        await reopened.markDispatchIntent({
          ...command(recovery.operation),
          holder: "recovery",
          leaseTtlMs: 1000,
        }),
      ).toMatchObject({ granted: false });
      const totals = await reopened.aggregate({ ...query, limit: 10 });
      expect(totals.rows.reduce((sum, row) => sum + (row.cost.money?.units ?? 0n), 0n)).toBe(2n);
    } finally {
      await f.close();
    }
  } finally {
    vi.unstubAllEnvs();
    await server.close();
  }
});
