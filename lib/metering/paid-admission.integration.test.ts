import { expect, test } from "vitest";
import * as admission from "./admission";
import { budget, input, paidFixture, required } from "./paid-attempt-test-fixture";

test("initialized allocations still check the project cap alongside connection budgets", async () => {
  const f = await paidFixture();
  try {
    await f.store.putBudget(budget("cents", 10n, "connection"));
    await f.store.putBudget(budget("budget_cents", 1n));
    await expect(
      f.run((tx) => admission.reservePaidAttempts(tx, [input()], f.options)),
    ).rejects.toMatchObject({
      outcome: { outcome: "exceeded", exceeded: { budget: { id: "group:budget_cents" } } },
    });
    expect(
      (
        await f.store.listOperations({
          scope: { kind: "namespace", namespace: "test" },
          from: "2020-01-01",
          to: "2030-01-01",
          states: ["reserved"],
        })
      ).operations,
    ).toHaveLength(0);
  } finally {
    await f.close();
  }
});
for (const kind of ["group", "connection"] as const)
  test(`unknown-cost ${kind} paid_attempts gate blocks new paid work`, async () => {
    const f = await paidFixture();
    try {
      await f.store.putBudget({
        ...budget("paid_attempts", 0n, kind),
        window: {
          kind: "since_reset",
          epoch: "unresolved-history",
          startsAt: f.clock.now().toISOString(),
        },
      });
      await expect(
        f.run((tx) => admission.reservePaidAttempts(tx, [input()], f.options)),
      ).rejects.toMatchObject({
        outcome: { outcome: "exceeded", exceeded: { budget: { unit: "paid_attempts" } } },
      });
    } finally {
      await f.close();
    }
  });
test("one denied child rolls back the complete queued taskset", async () => {
  const f = await paidFixture();
  try {
    await f.store.putBudget(budget());
    await expect(
      f.run((tx) => admission.reservePaidAttempts(tx, [input("a"), input("b")], f.options)),
    ).rejects.toMatchObject({ outcome: { outcome: "exceeded" } });
    expect(
      await f.store.getOperation({ namespace: "test", principal: "owner", operationId: "a" }),
    ).toBeNull();
    const statuses = await f.store.applicableBudgets({
      scope: input().reservation.scope,
      surface: "app",
      units: ["budget_cents"],
    });
    expect(statuses[0]?.reserved?.value).toBe(0n);
  } finally {
    await f.close();
  }
});

test("batch denial retains the refused child's connection and request surface", async () => {
  const f = await paidFixture();
  try {
    const denied = input("b", "denied-connection");
    denied.reservation.source = "api";
    denied.reservation.surface = "programmatic";
    await f.store.putBudget({
      ...budget("cents", 1n, "connection"),
      scope: { kind: "connection", namespace: "test", connection: "denied-connection" },
    });
    await expect(
      f.run((tx) => admission.reservePaidAttempts(tx, [input("a"), denied], f.options)),
    ).rejects.toMatchObject({
      context: { connectionId: "denied-connection", projectId: "project", surface: "programmatic" },
    });
  } finally {
    await f.close();
  }
});
test("reservations do not take intent; replay and changed context never grant a send", async () => {
  const f = await paidFixture();
  try {
    const request = input("stable");
    const [reserved] = await f.run((tx) => admission.reservePaidAttempts(tx, [request], f.options));
    expect(reserved).toMatchObject({ operation: { state: "reserved", lease: null } });
    const [replayed] = await f.run((tx) => admission.reservePaidAttempts(tx, [request], f.options));
    expect(replayed?.replayed).toBe(true);
    await expect(
      f.run((tx) => admission.markPaidAttemptDispatch(tx, required(replayed), "worker", f.options)),
    ).rejects.toThrow("replay");
    await expect(
      f.run((tx) =>
        admission.reservePaidAttempts(
          tx,
          [{ ...request, context: { ...request.context, rankCheckRunId: "different-run" } }],
          f.options,
        ),
      ),
    ).rejects.toThrow("context");
  } finally {
    await f.close();
  }
});
test("concurrent connections compete atomically for one project cap", async () => {
  const f = await paidFixture();
  try {
    await f.store.putBudget(budget());
    const results = await Promise.allSettled([
      f.run((tx) => admission.reservePaidAttempts(tx, [input("a")], f.options)),
      f.run((tx) => admission.reservePaidAttempts(tx, [input("b", "other-connection")], f.options)),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
  } finally {
    await f.close();
  }
});
test("a paid native-unit bound cannot be bypassed with a missing estimate", async () => {
  const f = await paidFixture();
  try {
    await f.store.putBudget(budget("tokens", 10n, "connection"));
    await expect(
      f.run((tx) => admission.reservePaidAttempts(tx, [input()], f.options)),
    ).rejects.toMatchObject({
      outcome: { outcome: "invalid", reason: "missing_estimate_unit", unit: "tokens" },
    });
  } finally {
    await f.close();
  }
});

test("caller mutation during admission cannot change frozen quotes or retained context", async () => {
  const f = await paidFixture();
  try {
    const request = input("frozen");
    const result = await f.run((tx) =>
      admission.reservePaidAttempts(tx, [request], {
        ...f.options,
        verifyBinding: async () => {
          request.context.correlationId = "changed";
          required(request.reservation.estimate?.[0]).value = 999n;
        },
      }),
    );
    expect(result[0]?.operation.estimate.find((q) => q.unit === "cents")?.value).toBe(2n);
    expect(
      await f.run(
        (tx) =>
          tx.$queryRaw`SELECT context->>'correlationId' AS correlation FROM metering_paid_attempt_context`,
      ),
    ).toEqual([{ correlation: "correlation" }]);
  } finally {
    await f.close();
  }
});
test("a taskset cannot mix financial namespaces", async () => {
  const f = await paidFixture();
  try {
    const other = input("b");
    other.reservation.scope.namespace = "different";
    await expect(
      f.run((tx) => admission.reservePaidAttempts(tx, [input("a"), other], f.options)),
    ).rejects.toThrow("taskset");
  } finally {
    await f.close();
  }
});
