import { readModelPlaygroundHistory } from "@/lib/ai-research/model-playground-history";
import { Prisma } from "@/lib/generated/prisma/client";
import { beforeEach, expect, test, vi } from "vitest";
import { readModelAttempts } from "./admission-storage";
import { executeModelPlayground } from "./execute";
import { launchModelPlayground } from "./launch";
import { launchHarness, launchRequest } from "./launch.test-support";
import { withoutFixtureTrigger } from "./launch-database.test-support";
import { previewModelPlayground } from "./preview";
import { readModelPlayground } from "./read";
import { saveModelPlaygroundReport } from "./report";
import * as reports from "./report-finalize";
import { recoverModelPlaygroundReports } from "./report-recovery";
import { createModelPlaygroundStore } from "./store";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  reports: vi.fn(),
  pins: vi.fn(),
  after: vi.fn(),
}));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("./database", () => ({
  modelPlaygroundDatabase: {
    $transaction: () => {
      throw new Error("Default database must not be used by execution");
    },
  },
}));
vi.mock("./report-context", () => ({
  loadModelReportEntities: async () => [],
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRaw: mocks.query,
    agentReport: { findMany: mocks.reports },
    researchHistoryPin: { findMany: mocks.pins },
    projectDefaults: { findUnique: async () => ({ timezone: "UTC" }) },
  },
}));

const originalFinalizer = reports.finalizeModelPlaygroundReport;
const h = launchHarness();
beforeEach(async () => {
  vi.restoreAllMocks();
  mocks.after.mockReset().mockImplementation((task) => {
    void task();
  });
  vi.spyOn(reports, "finalizeModelPlaygroundReport");
  await h.sql.exec(`ALTER TABLE agent_reports ADD COLUMN "publicId" text UNIQUE,
    ADD COLUMN kind text, ADD COLUMN title text, ADD COLUMN body jsonb,
    ADD COLUMN provenance jsonb, ADD COLUMN "createdById" text,
    ADD COLUMN "createdAt" timestamp DEFAULT CURRENT_TIMESTAMP;
    CREATE TYPE "ResearchHistorySurface" AS ENUM ('model_playground');
    CREATE TABLE research_history_pins("userId" text,"projectId" text,surface "ResearchHistorySurface","itemKey" text);`);
  mocks.query.mockImplementation(async (sql, ...values) => {
    const query = Array.isArray(sql)
      ? Prisma.sql(sql as unknown as TemplateStringsArray, ...values)
      : sql;
    return (await h.sql.query(query.text, query.values)).rows;
  });
  mocks.reports.mockImplementation(
    async ({ where, take }) =>
      (
        await h.sql.query(
          `SELECT a.*,json_build_object('id',r.id) AS "modelPlaygroundRun"
    FROM agent_reports a JOIN model_playground_runs r ON r."reportId"=a.id AND r."projectId"=a."projectId"
    WHERE a."projectId"=$1 AND a.id=ANY($2::text[]) ORDER BY a."createdAt" DESC,a.id DESC LIMIT $3`,
          [where.projectId, where.id.in, take],
        )
      ).rows,
  );
  mocks.pins.mockResolvedValue([]);
  h.input.columns.push({ ...structuredClone(h.input.columns[0]), columnId: crypto.randomUUID() });
});
const preview = () => previewModelPlayground(h.runtime, { revision: "revision", input: h.input });
const stored = (runId: string) =>
  createModelPlaygroundStore(h.runtime.db).read(h.context.projectId, runId);
const reportRows = async () =>
  (
    await h.sql.query<{ body: { runId: string; results: unknown[] }; publicId: string }>(
      `SELECT * FROM agent_reports`,
    )
  ).rows;
async function finalisation() {
  for (const call of vi.mocked(reports.finalizeModelPlaygroundReport).mock.results)
    await Promise.resolve(call.value).catch(() => {});
}

async function admitted() {
  const q = await preview();
  const run = await h.admitOnly(q);
  const attempts = await h.runtime.db.$transaction((tx) => readModelAttempts(tx, q.previewId));
  return { runId: run.id, projectId: h.context.projectId, attempts };
}

test("preview to fake-adapter launch saves one composite report and its History item", async () => {
  const q = await preview();
  const original = originalFinalizer;
  const finalize = vi
    .spyOn(reports, "finalizeModelPlaygroundReport")
    .mockImplementation(async (runId, db) => {
      const attempts = await h.runtime.db.$transaction((tx) => readModelAttempts(tx, q.previewId));
      expect(attempts.map((attempt) => attempt.state)).toEqual(["observed", "observed"]);
      return original(runId, db);
    });
  expect(h.calls).toHaveLength(0);
  const request = launchRequest(q);
  const out = await launchModelPlayground(h.runtime, request);
  expect(out.kind).toBe("admitted");
  if (out.kind !== "admitted") throw new Error("Expected admitted run");
  expect(out.result.columns.map((column) => column.state)).toEqual(["completed", "completed"]);
  expect(finalize).toHaveBeenCalledExactlyOnceWith(out.result.runId, h.runtime.db);
  await finalisation();
  const rows = await reportRows();
  expect(rows).toHaveLength(1);

  expect(rows[0].body.runId).toBe(out.result.runId);
  expect(rows[0].body.results).toHaveLength(2);
  const page = await readModelPlaygroundHistory(h.context.projectId, "actor", {
    query: "",
    filters: [],
    cursor: null,
  });
  expect(page.total).toBe(1);
  expect(page.groups.flatMap((group) => group.rows)).toMatchObject([
    {
      key: rows[0].publicId,
      title: h.input.prompt,
      meta: { engines: [`api:${h.input.columns[0].providerId}:${h.input.columns[0].modelId}`] },
    },
  ]);
  await launchModelPlayground(h.runtime, request);
  expect(await reportRows()).toHaveLength(1);
  expect(finalize).toHaveBeenCalledTimes(1);
  expect(h.calls).toHaveLength(2);
  expect(fetch).not.toHaveBeenCalled();
});

test("a supplementary report-link lookup failure retains the readable paid answers", async () => {
  const q = await preview();
  const out = await launchModelPlayground(h.runtime, launchRequest(q));
  if (out.kind !== "admitted") throw new Error("Expected admitted run");
  await finalisation();
  expect(await reportRows()).toHaveLength(1);
  await h.sql.exec(`ALTER TABLE agent_reports DROP COLUMN "publicId"`);
  const read = await readModelPlayground(h.runtime, out.result.runId);
  expect(read?.reportId).toBeUndefined();
  expect(read?.columns.map((column) => column.answer)).toEqual([
    "An answer with two citations.",
    "An answer with two citations.",
  ]);
  expect(h.calls).toHaveLength(2);
});

test.each(["sequential", "refused"] as const)(
  "last terminal column finalises once: %s",
  async (mode) => {
    const execution = await admitted();
    const finalize = vi.spyOn(reports, "finalizeModelPlaygroundReport");
    const first = { ...execution, attempts: execution.attempts.slice(0, 1) };
    const last = { ...execution, attempts: execution.attempts.slice(1) };
    await executeModelPlayground(h.runtime, first);
    expect(await reportRows()).toHaveLength(0);
    expect(finalize).not.toHaveBeenCalled();
    if (mode === "refused") h.block();
    await executeModelPlayground(h.runtime, last);
    expect(finalize).toHaveBeenCalledExactlyOnceWith(execution.runId, h.runtime.db);
    await finalisation();
    expect(await reportRows()).toHaveLength(1);
    await executeModelPlayground(h.runtime, execution);
    expect(finalize).toHaveBeenCalledTimes(1);
  },
);

test.each(["storage", "throw"] as const)(
  "finalisation %s preserves committed answers and permits a later retry",
  async (mode) => {
    const execution = await admitted();
    const finalize = vi.spyOn(reports, "finalizeModelPlaygroundReport");
    if (mode === "storage")
      await h.sql.exec(`CREATE FUNCTION reject_report() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic report failure'; END $$;
    CREATE TRIGGER reject_report BEFORE INSERT ON agent_reports FOR EACH ROW EXECUTE FUNCTION reject_report();`);
    else
      finalize.mockImplementationOnce(async (runId) => {
        expect(
          (await stored(runId)).columns.every((column) => column.result?.answer !== null),
        ).toBe(true);
        throw new Error("Synthetic finaliser failure");
      });
    const results = await executeModelPlayground(h.runtime, execution);
    expect(results.map((result) => result.state)).toEqual(["finished", "finished"]);
    expect(finalize).toHaveBeenCalledExactlyOnceWith(execution.runId, h.runtime.db);
    expect((await stored(execution.runId)).columns.map((column) => column.result?.answer)).toEqual([
      "An answer with two citations.",
      "An answer with two citations.",
    ]);
    await finalisation();
    expect(await reportRows()).toHaveLength(0);
    if (mode === "storage") await h.sql.exec(`DROP TRIGGER reject_report ON agent_reports`);
    expect((await reports.finalizeModelPlaygroundReport(execution.runId, h.runtime.db)).ok).toBe(
      true,
    );
    expect(await reportRows()).toHaveLength(1);
    expect(h.calls).toHaveLength(2);
  },
);

test("a finaliser that never resolves cannot delay launch or hide any paid answer", async () => {
  let started!: () => void;
  const finaliserStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  const finalize = vi.spyOn(reports, "finalizeModelPlaygroundReport").mockImplementation(() => {
    started();
    return new Promise(() => {});
  });
  const q = await preview();
  const timeout = Symbol("launch waited for report");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const launching = launchModelPlayground(h.runtime, launchRequest(q));
    await finaliserStarted;
    const out = await Promise.race([
      launching,
      new Promise<typeof timeout>((resolve) => {
        timer = setTimeout(() => resolve(timeout), 2000);
      }),
    ]);
    expect(out).not.toBe(timeout);
    if (typeof out === "symbol" || out.kind !== "admitted") throw new Error("Expected answers");
    expect(out.result.columns.map((c) => c.answer)).toEqual([
      "An answer with two citations.",
      "An answer with two citations.",
    ]);
    expect(finalize).toHaveBeenCalledExactlyOnceWith(out.result.runId, h.runtime.db);
    expect((await stored(out.result.runId)).columns.every((c) => c.result?.answer)).toBe(true);
    expect(h.calls).toHaveLength(2);
  } finally {
    clearTimeout(timer);
  }
});

test("an expired observable attempt cannot freeze a report before its late paid answer", async () => {
  h.input.columns.pop();
  const execution = await admitted();
  h.pause(async () => {
    const column = (await stored(execution.runId)).columns[0];
    if (!column.leaseToken) throw new Error("Expected dispatched lease");
    await h.sql.query(
      `UPDATE model_playground_columns SET "leaseExpiresAt"=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE "runId"=$1`,
      [execution.runId],
    );
    expect(
      await createModelPlaygroundStore(h.runtime.db).expireDispatched({
        projectId: execution.projectId,
        runId: execution.runId,
        columnId: column.columnId,
        leaseToken: column.leaseToken,
      }),
    ).toBe(true);
    expect(
      await saveModelPlaygroundReport(
        h.runtime.db,
        { projectId: execution.projectId, runId: execution.runId },
        [],
      ),
    ).toEqual({
      ok: false,
      reason: "pending",
    });
    expect(await recoverModelPlaygroundReports(h.runtime.db)).toMatchObject({
      ok: true,
      attempted: 0,
    });
    expect(await reportRows()).toHaveLength(0);
  });
  const answers = await executeModelPlayground(h.runtime, execution);
  expect(answers[0].result?.answer).toBe("An answer with two citations.");
  await finalisation();
  expect((await stored(execution.runId)).columns[0].result?.answer).toBe(answers[0].result?.answer);
  expect((await reportRows())[0].body.results).toMatchObject([
    { answer: answers[0].result?.answer },
  ]);
  expect(h.calls).toHaveLength(1);
});

test("post-response lifetime registration is deferred and registration failure preserves answers", async () => {
  const deferred: Array<() => Promise<void>> = [];
  mocks.after.mockImplementation((task) => {
    deferred.push(task);
  });
  const execution = await admitted();
  const out = await executeModelPlayground(h.runtime, execution);
  expect(out.every((c) => c.result?.answer)).toBe(true);
  expect(mocks.after).toHaveBeenCalledOnce();
  expect(reports.finalizeModelPlaygroundReport).not.toHaveBeenCalled();
  await deferred[0]();
  expect(reports.finalizeModelPlaygroundReport).toHaveBeenCalledExactlyOnceWith(
    execution.runId,
    h.runtime.db,
  );
  await finalisation();
  expect(await reportRows()).toHaveLength(1);
  mocks.after.mockImplementation(() => {
    throw new Error("No request context");
  });
  h.input.prompt = "Independent second question";
  const next = await admitted();
  const answers = await executeModelPlayground(h.runtime, next);
  expect(answers.every((c) => c.result?.answer)).toBe(true);
  expect((await stored(next.runId)).columns.every((c) => c.result?.answer)).toBe(true);
  expect(h.calls).toHaveLength(4);
});

test.each(["refresh", "dismissed", "storage", "legacy_metadata", "migration_hold", "migrated"])(
  "a paid answer after a saved unknown report: %s",
  async (mode) => {
    h.input.columns.pop();
    const execution = await admitted();
    const afterTasks: Array<() => Promise<void>> = [];
    mocks.after.mockImplementation((task) => {
      afterTasks.push(task);
    });
    let reportId: string | undefined;
    h.pause(async () => {
      const column = (await stored(execution.runId)).columns[0];
      if (!column.leaseToken) throw new Error("Expected dispatched lease");
      await withoutFixtureTrigger(
        h.sql,
        "model_playground_columns",
        "model_playground_column_integrity",
        async () => {
          await h.sql.query(
            `UPDATE model_playground_columns SET "leaseExpiresAt"=CURRENT_TIMESTAMP-INTERVAL '1 second',"dispatchStartedAt"=CURRENT_TIMESTAMP-INTERVAL '151 seconds' WHERE "runId"=$1`,
            [execution.runId],
          );
        },
      );
      // Advance immutable dispatch timing only inside this disposable fixture.
      await withoutFixtureTrigger(
        h.sql,
        "model_playground_payment_attempts",
        "model_playground_payment_attempt_guard",
        async () => {
          await h.sql.query(
            `UPDATE model_playground_payment_attempts SET dispatched_at=CURRENT_TIMESTAMP-INTERVAL '151 seconds' WHERE id=$1`,
            [execution.attempts[0].id],
          );
        },
      );
      expect(
        await createModelPlaygroundStore(h.runtime.db).expireDispatched({
          projectId: execution.projectId,
          runId: execution.runId,
          columnId: column.columnId,
          leaseToken: column.leaseToken,
        }),
      ).toBe(true);
      const saved = await saveModelPlaygroundReport(
        h.runtime.db,
        { projectId: execution.projectId, runId: execution.runId },
        [],
      );
      expect(saved.ok).toBe(true);
      if (!saved.ok) throw new Error("Expected saved report");
      reportId = saved.reportId;
      if (mode === "legacy_metadata")
        await h.sql.exec(`UPDATE agent_reports SET body=body-'brandsCapturedAt'-'brandsBasis'`);
      expect((await reportRows())[0].body.results).toMatchObject([
        { state: "unknown", answer: null },
      ]);
      if (mode === "migration_hold" || mode === "migrated")
        await h.sql.query(`UPDATE projects SET "writeMode"=$1 WHERE id=$2`, [
          mode,
          execution.projectId,
        ]);
      if (mode === "dismissed") await h.sql.exec(`DELETE FROM agent_reports`);
      if (mode === "storage")
        await h.sql.exec(`CREATE FUNCTION reject_refresh() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture refresh failure'; END $$;
      CREATE TRIGGER reject_refresh BEFORE UPDATE ON agent_reports FOR EACH ROW EXECUTE FUNCTION reject_refresh();`);
    });
    const out = await executeModelPlayground(h.runtime, execution);
    expect(afterTasks).toHaveLength(1);
    await finalisation();
    expect(out[0].result?.answer).toBe("An answer with two citations.");
    expect((await stored(execution.runId)).columns[0].result?.answer).toBe(out[0].result?.answer);
    expect(h.calls).toHaveLength(1);
    if (mode === "dismissed") {
      expect(await reportRows()).toHaveLength(0);
      expect(await recoverModelPlaygroundReports(h.runtime.db)).toMatchObject({
        ok: true,
        attempted: 0,
      });
    } else {
      expect((await reportRows())[0].body.results).toMatchObject([{ answer: null }]);
      if (mode === "migration_hold" || mode === "migrated") {
        expect(
          (
            await h.sql.query(
              `SELECT "reportState","reportFailure" FROM model_playground_runs WHERE id=$1`,
              [execution.runId],
            )
          ).rows[0],
        ).toMatchObject({ reportState: "saved", reportFailure: null });
        await h.sql.query(`UPDATE projects SET "writeMode"='active' WHERE id=$1`, [
          execution.projectId,
        ]);
        expect(
          await reports.finalizeModelPlaygroundReport(execution.runId, h.runtime.db),
        ).toMatchObject({ ok: true, reportId, alreadySaved: true });
      }
      if (mode === "storage") {
        await h.sql.exec(`DROP TRIGGER reject_refresh ON agent_reports`);
        expect(
          await reports.finalizeModelPlaygroundReport(execution.runId, h.runtime.db),
        ).toMatchObject({ ok: true, reportId, alreadySaved: true });
      }
      if (mode === "refresh" || mode === "legacy_metadata") {
        for (const task of afterTasks) await task();
      }
      expect(await reportRows()).toHaveLength(1);
      expect((await reportRows())[0]).toMatchObject({
        publicId: reportId,
        body: { results: [{ answer: out[0].result?.answer }] },
      });
    }
    if (mode === "legacy_metadata") {
      const [row] = (
        await h.sql.query<{ body: Record<string, unknown> }>(`SELECT body FROM agent_reports`)
      ).rows;
      expect(row.body).not.toHaveProperty("brandsCapturedAt");
      expect(row.body).not.toHaveProperty("brandsBasis");
    }
    if (mode !== "refresh" && mode !== "legacy_metadata") {
      for (const task of afterTasks) await task();
    }
  },
);

test("dispatch fences and journal locks share one transaction; settlement has no reverse run lock", async () => {
  const execution = await admitted();
  const transactions: string[][] = [];
  const traced = {
    ...h.runtime,
    db: {
      $transaction: (work: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        h.runtime.db.$transaction(async (tx) => {
          const trace: string[] = [];
          transactions.push(trace);
          return work(
            new Proxy(tx, {
              get(target, key) {
                const value = Reflect.get(target, key);
                if (
                  typeof value !== "function" ||
                  (!String(key).startsWith("$queryRaw") && !String(key).startsWith("$executeRaw"))
                )
                  return value;
                return (...args: unknown[]) => {
                  const query = args[0];
                  trace.push(
                    typeof query === "string"
                      ? query
                      : Array.isArray(query)
                        ? Prisma.sql(query as unknown as TemplateStringsArray, ...args.slice(1))
                            .text
                        : (query as Prisma.Sql).text,
                  );
                  return Reflect.apply(value, target, args);
                };
              },
            }),
          );
        }),
    } as typeof h.runtime.db,
  };
  await executeModelPlayground(traced, execution);
  await finalisation();
  const dispatch = transactions.filter((trace) =>
    trace.some((sql) => /UPDATE model_playground_payment_attempts SET dispatched_at=/.test(sql)),
  );
  expect(dispatch).toHaveLength(2);
  for (const trace of dispatch) {
    const at = (pattern: RegExp) => {
      const index = trace.findIndex((sql) => pattern.test(sql));
      expect(index, pattern.source).toBeGreaterThanOrEqual(0);
      return index;
    };
    const run = at(/FROM model_playground_runs.*FOR UPDATE/);
    const column = at(/FROM model_playground_columns.*FOR UPDATE/);
    const fence = at(/UPDATE model_playground_columns SET "dispatchStartedAt"/);
    const quote = at(/FROM model_playground_payment_quotes.*FOR UPDATE/);
    const owner = at(/pg_advisory_xact_lock/);
    const actor = at(/FROM users.*FOR SHARE/);
    expect(run).toBeLessThan(column);
    expect(column).toBeLessThan(fence);
    expect(fence).toBeLessThan(quote);
    expect(quote).toBeLessThan(owner);
    expect(owner).toBeLessThan(actor);
  }
  const settlement = transactions.filter((trace) =>
    trace.some((sql) => sql.includes("INSERT INTO model_playground_payment_observations")),
  );
  expect(settlement).toHaveLength(2);
  for (const trace of settlement) {
    expect(trace.some((sql) => sql.includes("pg_advisory_xact_lock"))).toBe(true);
    expect(
      trace.some((sql) => /model_playground_(runs|columns).*FOR (UPDATE|SHARE)/.test(sql)),
    ).toBe(false);
  }
});
