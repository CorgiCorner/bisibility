import type { PostgresDriver, PostgresExecutor } from "@usagekit/store-postgres";
import { expect, test, vi } from "vitest";
import { budgetSnapshotDriver, withBudgetReadExecutor } from "./read-snapshot";

const statement = { text: "SELECT body FROM metering_budget WHERE namespace=$1", values: ["test"] };
function fixture(value = 1) {
  const query = vi.fn(async () => [{ value }]);
  const execute = vi.fn(async () => 0);
  const executor = { query, execute } as unknown as PostgresExecutor;
  const transaction = vi.fn(async (_readOnly, body) => body(executor));
  return {
    query,
    execute,
    executor,
    transaction,
    driver: budgetSnapshotDriver({ transaction } as PostgresDriver),
  };
}

test("concurrent duplicate budget reads share one query inside a snapshot", async () => {
  const f = fixture();
  const read = () => f.driver.transaction(true, (sql) => sql.query<{ value: number }>(statement));
  await withBudgetReadExecutor(f.executor, async () => {
    const [a, b] = await Promise.all([read(), read()]);
    a[0].value = 99;
    expect(b).toEqual([{ value: 1 }]);
    expect(await read()).toEqual([{ value: 1 }]);
  });
  expect(f.query).toHaveBeenCalledTimes(1);
  expect(f.transaction).not.toHaveBeenCalled();
  await read();
  expect(f.transaction).toHaveBeenCalledTimes(1);
});

test("read snapshots cannot execute or begin a write", async () => {
  const f = fixture();
  await withBudgetReadExecutor(f.executor, async () => {
    expect(() => f.driver.transaction(false, async () => undefined)).toThrow("cannot start write");
    await expect(f.driver.transaction(true, (sql) => sql.execute(statement))).rejects.toThrow(
      "cannot execute writes",
    );
  });
  expect(f.execute).not.toHaveBeenCalled();
});

test("different snapshots, parameters and authorization reads are never reused", async () => {
  const a = fixture(1),
    b = fixture(2);
  const read = (f: ReturnType<typeof fixture>) =>
    withBudgetReadExecutor(f.executor, () =>
      f.driver.transaction(true, (sql) => sql.query(statement)),
    );
  expect(await Promise.all([read(a), read(b)])).toEqual([[{ value: 1 }], [{ value: 2 }]]);
  await withBudgetReadExecutor(a.executor, async () => {
    await a.driver.transaction(true, (sql) => sql.query(statement));
    await a.driver.transaction(true, (sql) => sql.query({ ...statement, values: ["another"] }));
    const auth = { text: "SELECT * FROM memberships", values: [] };
    await a.driver.transaction(true, (sql) => sql.query(auth));
    await a.driver.transaction(true, (sql) => sql.query(auth));
  });
  expect(a.query).toHaveBeenCalledTimes(5);
});
