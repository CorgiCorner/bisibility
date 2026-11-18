import { expect, test } from "vitest";
import { result } from "./contract-fixtures.test-support";
import { historyHarness } from "./history.test-support";
import { createColumnStore } from "./store-columns";
import type { ModelPlaygroundDatabase } from "./store-db";
import { completeModelRunColumn } from "./store-terminal";

const h = historyHarness();

test.each(["malformed", "sql_error"])(
  "terminality %s never rolls back the paid answer",
  async (fault) => {
    const run = await h.launch(false);
    const lease = await h.store.claim({
      projectId: "project-a",
      runId: run.id,
      columnId: run.columns[0].columnId,
      leaseSeconds: 300,
    });
    if (!lease?.leaseToken) throw new Error("Expected lease");
    const identity = {
      projectId: "project-a",
      runId: run.id,
      columnId: lease.columnId,
      leaseToken: lease.leaseToken,
    };
    await h.store.fenceDispatch(identity);
    let injected = 0;
    const db: ModelPlaygroundDatabase = {
      $transaction: (work) =>
        h.database.$transaction((tx) =>
          work({
            $queryRawUnsafe: async <T>(sql: string, ...args: unknown[]): Promise<T[]> => {
              if (/SELECT (?:c\.)?state\b/.test(sql)) {
                injected++;
                if (fault === "sql_error")
                  return tx.$queryRawUnsafe("SELECT synthetic_missing_column");
                return [{ state: "unparsable sibling" }] as T[];
              }
              return tx.$queryRawUnsafe<T>(sql, ...args);
            },
          }),
        ),
    };
    expect(
      await completeModelRunColumn(db, identity, async (tx) => {
        await createColumnStore({ $transaction: async (work) => work(tx) }).complete(
          identity,
          result(),
        );
        return true;
      }),
    ).toBe(false);
    expect(injected).toBe(1);
    expect((await h.store.read("project-a", run.id)).columns[0].result?.answer).toBe(
      result().answer,
    );
  },
);

test.each(["claim", "fenceDispatch", "complete", "expireDispatched"] as const)(
  "%s locks run before column",
  async (operation) => {
    const run = await h.launch(false);
    const base = { projectId: "project-a", runId: run.id, columnId: run.columns[0].columnId };
    let identity = { ...base, leaseToken: "" };
    if (operation !== "claim") {
      const lease = await h.store.claim({ ...base, leaseSeconds: 300 });
      if (!lease?.leaseToken) throw new Error("Expected lease");
      identity = { ...base, leaseToken: lease.leaseToken };
      if (operation !== "fenceDispatch") await h.store.fenceDispatch(identity);
    }
    const locks: string[] = [];
    const db: ModelPlaygroundDatabase = {
      $transaction: (work) =>
        h.database.$transaction((tx) =>
          work({
            $queryRawUnsafe: async <T>(sql: string, ...args: unknown[]) => {
              if (sql.includes("FOR UPDATE")) locks.push(sql);
              return tx.$queryRawUnsafe<T>(sql, ...args);
            },
          }),
        ),
    };
    const store = createColumnStore(db);
    if (operation === "claim") await store.claim({ ...base, leaseSeconds: 300 });
    else if (operation === "complete") await store.complete(identity, result());
    else await store[operation](identity);
    expect(locks).toHaveLength(2);
    expect(locks[0]).toContain("FROM model_playground_runs");
    expect(locks[1]).toContain("FROM model_playground_columns");
    const outside = { ...identity, projectId: "project-b" };
    if (operation === "claim")
      expect(await store.claim({ ...base, projectId: "project-b", leaseSeconds: 300 })).toBeNull();
    else if (operation === "fenceDispatch")
      await expect(store.fenceDispatch(outside)).rejects.toMatchObject({ code: "stale_lease" });
    else if (operation === "complete")
      await expect(store.complete(outside, result())).rejects.toMatchObject({ code: "not_found" });
    else expect(await store.expireDispatched(outside)).toBe(false);
  },
);

test("terminality savepoint release cannot roll back the answer or write a report", async () => {
  const run = await h.launch(false);
  const lease = await h.store.claim({
    projectId: "project-a",
    runId: run.id,
    columnId: run.columns[0].columnId,
    leaseSeconds: 300,
  });
  if (!lease?.leaseToken) throw new Error("Expected lease");
  const identity = {
    projectId: "project-a",
    runId: run.id,
    columnId: lease.columnId,
    leaseToken: lease.leaseToken,
  };
  await h.store.fenceDispatch(identity);
  const reportId = crypto.randomUUID();
  await h.db.query(
    `INSERT INTO agent_reports(id,"publicId","projectId",kind,title,body,provenance,"createdById") VALUES($1,'agr_terminalitymarker00000001','project-a','prompt_explorer','Held','{}'::jsonb,'{}'::jsonb,'actor-a')`,
    [reportId],
  );
  await h.db.query(`UPDATE model_playground_runs SET "reportId"=$2 WHERE id=$1`, [
    run.id,
    reportId,
  ]);
  await h.db.query(`UPDATE projects SET "writeMode"='migration_hold' WHERE id='project-a'`);
  let releases = 0;
  const db: ModelPlaygroundDatabase = {
    $transaction: (work) =>
      h.database.$transaction((tx) =>
        work({
          $queryRawUnsafe: async <T>(sql: string, ...args: unknown[]) => {
            if (sql === "RELEASE SAVEPOINT model_report_terminality") {
              releases += 1;
              if (releases === 1) return tx.$queryRawUnsafe("SELECT synthetic_missing_column");
            }
            return tx.$queryRawUnsafe<T>(sql, ...args);
          },
        }),
      ),
  };
  await completeModelRunColumn(db, identity, async (tx) => {
    await createColumnStore({ $transaction: async (work) => work(tx) }).complete(
      identity,
      result(),
    );
    return true;
  });
  expect(releases).toBeGreaterThan(0);
  expect((await h.store.read("project-a", run.id)).columns[0].result?.answer).toBe(result().answer);
  expect(
    (
      await h.db.query<{ reportState: string; reportFailure: string | null }>(
        `SELECT "reportState","reportFailure" FROM model_playground_runs WHERE id=$1`,
        [run.id],
      )
    ).rows[0],
  ).toEqual({ reportState: "saved", reportFailure: null });
});
