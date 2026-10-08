import type { Budget, CountRequestInput } from "@usagekit/core";
import { expect, test } from "vitest";
import { createPostgresStore } from "./index";
import { Prisma, transactions } from "./sql";
import { bound, command, receipt, request } from "./test-data";
import { fixture } from "./test-fixture";

const quantity = (value: bigint) => ({ unit: "requests", value, scale: 0 });

test("separate clients persist source/tag alert crossings and replay them after restart", async () => {
  const f = await fixture(),
    client = f.connect();
  try {
    const second = await createPostgresStore({ prisma: client, schema: f.schema, clock: f.clock });
    const budget: Budget = {
      ...bound(),
      scope: { kind: "tag", namespace: "test", tag: "campaign" },
      surface: "mcp",
      limit: quantity(2n),
      hardLimit: quantity(5n),
      onExceed: "allow",
      alerts: [{ at: { percent: 50 } }],
    };
    await f.store.putBudget(budget);
    const firstInput = {
      ...request(),
      scope: { ...request().scope, tags: ["campaign"] },
      source: "mcp" as const,
      surface: "programmatic" as const,
      estimate: [quantity(3n)],
    };
    const results = await Promise.all([
      f.store.reserve(firstInput),
      second.reserve({ ...firstInput, operationId: crypto.randomUUID(), estimate: [quantity(1n)] }),
    ]);
    expect(results.every((r) => r.outcome === "reserved")).toBe(true);
    expect(results.flatMap((r) => (r.outcome === "reserved" ? r.alerts : []))).toHaveLength(1);
    expect(results.flatMap((r) => (r.outcome === "reserved" ? r.warnings : []))).not.toHaveLength(
      0,
    );
    const original = results[0];
    await f.restart();
    expect(await f.store.reserve(firstInput)).toEqual({ ...original, replayed: true });
    expect(
      await f.store.reserve({
        ...firstInput,
        operationId: crypto.randomUUID(),
        estimate: [quantity(2n)],
      }),
    ).toMatchObject({ outcome: "exceeded", exceeded: { boundary: "hardLimit" } });
    expect(
      await f.store.reserve({ ...firstInput, operationId: crypto.randomUUID(), source: "api" }),
    ).toMatchObject({ outcome: "reserved", warnings: [], alerts: [] });
    const [row] = await transactions(f.client(), f.schema, f.counters).read((sql) =>
      sql.query<{ n: bigint }>(Prisma.sql`SELECT count(*) AS n FROM metering_alert`),
    );
    expect(row?.n).toBe(1n);
  } finally {
    await client.$disconnect();
    await f.close();
  }
});

test("operation cursors freeze pending membership while returning current correction history", async () => {
  const f = await fixture();
  try {
    const pending = async () => {
      const reservation = await f.store.reserve(request());
      if (reservation.outcome !== "reserved") throw new Error("fixture reservation");
      const grant = await f.store.markDispatchIntent({
        ...command(reservation.operation),
        holder: "worker",
        leaseTtlMs: 60000,
      });
      if (!("granted" in grant) || !grant.granted) throw new Error("fixture dispatch");
      const unknown = {
        ...receipt(),
        cost: { certainty: "unknown" as const, money: null },
        measurements: [{ unit: "requests", quantity: null, certainty: "unknown" as const }],
      };
      const settled = await f.store.settle({
        ...command(grant.operation),
        authority: { kind: "lease", leaseId: grant.lease.leaseId },
        receipt: unknown,
      });
      if (settled.outcome !== "settled") throw new Error("fixture pending receipt");
      f.clock.advance(1000);
      return { operation: settled.operation, unknown };
    };
    const firstOperation = await pending(),
      secondOperation = await pending();
    const query = {
      scope: { kind: "namespace" as const, namespace: "test" },
      from: "2026-09-01T00:00:00Z",
      to: "2026-10-01T00:00:00Z",
      states: ["pending" as const],
      limit: 1,
    };
    const first = await f.store.listOperations(query);
    expect(first.operations[0]?.operationId).toBe(firstOperation.operation.operationId);
    expect(first.nextCursor).toBeTruthy();
    const correction = await f.store.correct({
      ...command(secondOperation.operation),
      authority: { kind: "late_evidence", source: "provider" },
      receipt: receipt(),
      replacesReceiptId: secondOperation.unknown.id,
      reason: "provider proof",
    });
    expect(correction.outcome).toBe("settled");
    await pending();
    await f.restart();
    const second = await f.store.listOperations({ ...query, cursor: first.nextCursor });
    expect(second.operations).toHaveLength(1);
    expect(second.operations[0]).toMatchObject({
      operationId: secondOperation.operation.operationId,
      state: "settled",
      version: 4,
      lease: null,
    });
    expect(second.operations[0]?.receipts).toHaveLength(2);
    expect(second.asOf).toBe(first.asOf);
    expect(second.watermark).toBe(first.watermark);
    expect(second.nextCursor).toBeUndefined();
  } finally {
    await f.close();
  }
});

test("old durable warn budgets normalize to soft allowances without rewriting history", async () => {
  const f = await fixture();
  try {
    const old = { ...bound(), onExceed: "warn" } as unknown as Budget;
    f.budgets.push(old);
    expect(await f.store.reserve({ ...request(), estimate: [quantity(2n)] })).toMatchObject({
      outcome: "reserved",
      warnings: [{ budget: { onExceed: "allow" } }],
    });
    const [row] = await transactions(f.client(), f.schema, f.counters).read((sql) =>
      sql.query<{ policy: string }>(
        Prisma.sql`SELECT body->>'onExceed' AS policy FROM metering_budget`,
      ),
    );
    expect(row?.policy).toBe("warn");
  } finally {
    await f.close();
  }
});

test("request replay is durable and races atomically with reservation identity", async () => {
  const f = await fixture(),
    client = f.connect();
  try {
    const second = await createPostgresStore({ prisma: client, schema: f.schema, clock: f.clock });
    const input = request();
    const counted: CountRequestInput = {
      commandId: input.operationId,
      scope: input.scope,
      surface: input.surface,
      source: input.source,
      provider: input.provider,
      operation: input.operation,
      state: "cached",
    };
    const results = await Promise.all([
      f.store.countRequest(counted),
      second.countRequest(counted),
    ]);
    expect(results).toContainEqual({ outcome: "counted", replayed: false });
    expect(results).toContainEqual({ outcome: "counted", replayed: true });
    await f.restart();
    expect(await f.store.countRequest(counted)).toEqual({ outcome: "counted", replayed: true });
    await expect(f.store.reserve(input)).rejects.toThrow("already counted without a reservation");
    const page = await f.store.requestCounts({
      scope: { kind: "namespace", namespace: "test" },
      from: "2026-09-01T00:00:00Z",
      to: "2026-10-01T00:00:00Z",
      groupBy: ["source"],
    });
    expect(page.rows).toEqual([{ dimensions: { source: "app" }, state: "cached", count: 1n }]);
    const raced = request();
    const outcomes = await Promise.allSettled([
      f.store.reserve(raced),
      second.countRequest({ ...counted, commandId: raced.operationId }),
    ]);
    expect(
      outcomes.filter(
        (r) =>
          r.status === "fulfilled" &&
          (r.value.outcome === "reserved" || r.value.outcome === "counted"),
      ),
    ).toHaveLength(1);
    expect(
      outcomes.filter((r) => r.status === "rejected" || r.value.outcome === "conflict"),
    ).toHaveLength(1);
  } finally {
    await client.$disconnect();
    await f.close();
  }
});
