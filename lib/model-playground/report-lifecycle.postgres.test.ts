import { beforeEach, expect, it, vi } from "vitest";
import { result } from "./contract-fixtures.test-support";
import { historyHarness } from "./history.test-support";
import { withoutFixtureTrigger } from "./launch-database.test-support";
import type { ModelPlaygroundDatabase } from "./store-db";
import type { ModelColumnResult } from "./types";

const shared = vi.hoisted(() => ({
  database: null as ModelPlaygroundDatabase | null,
  allowed: true,
  reads: 0,
  oversized: false,
  invalid: false,
  scopeOptions: undefined as { allowReadOnly?: boolean } | undefined,
}));
vi.mock("@/lib/model-playground/database", () => ({
  modelPlaygroundDatabase: {
    $transaction: (work: Parameters<ModelPlaygroundDatabase["$transaction"]>[0]) => {
      shared.reads++;
      return shared.database
        ? shared.database.$transaction(work)
        : Promise.reject(new Error("No fixture"));
    },
  },
}));
vi.mock("./report-context", () => ({
  loadModelReportEntities: async () =>
    shared.oversized || shared.invalid
      ? [
          {
            id: "brand",
            kind: "project",
            label: shared.invalid ? null : "Brand",
            domain: null,
            aliases: shared.oversized ? Array.from({ length: 20001 }, () => "a") : [],
            excludedNames: [],
          },
        ]
      : [],
}));
vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: async () => ({ id: "actor-a" }),
  requireProjectScope: async (
    _actor: unknown,
    _action: unknown,
    _ref: unknown,
    _resource: unknown,
    options?: { allowReadOnly?: boolean },
  ) => {
    shared.scopeOptions = options;
    if (!shared.allowed) throw new Error("forbidden");
    return { id: "project-a" };
  },
}));

import {
  readModelPlaygroundRetainedResultAction,
  saveModelPlaygroundReportAction,
} from "@/lib/actions/research-history";
import { finalizeModelPlaygroundReport } from "./report-finalize";
import { recoverModelPlaygroundReports } from "./report-recovery";
import { isTerminalReportRun, REPORT_TERMINAL_STATES } from "./report-state";
import { storedColumnStateSchema } from "./store-validation";

const h = historyHarness();
beforeEach(() => {
  shared.database = h.database;
  shared.allowed = true;
  shared.reads = 0;
  shared.oversized = false;
  shared.invalid = false;
  shared.scopeOptions = undefined;
});

const transitions: Array<{
  name: string;
  steps: string[];
  resultState?: ModelColumnResult["state"];
}> = [
  { name: "queued save", steps: ["save"] },
  { name: "claimed save", steps: ["claim", "save"] },
  ...(["partial", "cancelled", "failed", "unknown"] as const).map((resultState) => ({
    name: `${resultState} completion then save`,
    steps: ["claim", "fence", "complete", "save"],
    resultState,
  })),
  {
    name: "fenced pending then paid completion and save twice",
    steps: ["claim", "fence", "save", "complete", "finalize", "save"],
  },
  {
    name: "expired dispatch waits through observation window",
    steps: ["claim", "fence", "expire", "finalize", "elapsed", "finalize", "save"],
  },
  ...(["too_large", "conflict"] as const).map((failure) => ({
    name: `${failure} is durable, omitted by sweep, then explicitly repaired`,
    steps: ["claim", "fence", "complete", failure, "save", "sweep", "context_repaired", "finalize"],
  })),
  { name: "concurrent saves", steps: ["claim", "fence", "complete", "concurrent"] },
  {
    name: "storage failure then retry",
    steps: ["claim", "fence", "complete", "break", "save", "repair", "finalize"],
  },
  { name: "forbidden before any read", steps: ["deny", "save", "allow", "save"] },
  {
    name: "delete then save stays dismissed",
    steps: ["claim", "fence", "complete", "finalize", "delete", "save"],
  },
  ...["migration_hold", "migrated"].map((mode) => ({
    name: `${mode} refuses action and finalize then active permits saving`,
    steps: ["claim", "fence", "complete", mode, "save", "finalize", "active", "finalize"],
  })),
  {
    name: "saved report remains readable during hold",
    steps: ["claim", "fence", "complete", "save", "migration_hold", "save", "finalize"],
  },
  ...(["partial", "cancelled"] as const).map((resultState) => ({
    name: `${resultState} rejects re-completion and saves original result`,
    steps: ["claim", "fence", "complete", "recomplete", "finalize"],
    resultState,
  })),
];

it.each(transitions)(
  "report transition table: $name",
  async ({ steps, resultState = "completed" }) => {
    const run = await h.launch(false);
    const input = { projectRef: "project-a", runId: run.id };
    let identity: { projectId: string; runId: string; columnId: string; leaseToken: string };
    const claimed = () => {
      if (!identity) throw new Error("Expected claim");
      return identity;
    };
    let terminal = false;
    let broken = false;
    let readOnly = false;
    let savedId: string | undefined;
    let dismissed = false;
    let failure: "too_large" | "conflict" | null = null;
    for (const step of steps) {
      if (step === "claim") {
        const lease = await h.store.claim({
          projectId: "project-a",
          runId: run.id,
          columnId: run.columns[0].columnId,
          leaseSeconds: 300,
        });
        if (!lease?.leaseToken) throw new Error("Expected claim");
        identity = {
          projectId: "project-a",
          runId: run.id,
          columnId: lease.columnId,
          leaseToken: lease.leaseToken,
        };
      } else if (step === "fence") await h.store.fenceDispatch(claimed());
      else if (step === "complete") {
        await h.store.complete(claimed(), { ...result(), state: resultState });
        terminal = true;
      } else if (step === "recomplete") {
        await expect(h.store.complete(claimed(), result())).rejects.toMatchObject({
          code: "stale_lease",
        });
        expect((await h.store.read("project-a", run.id)).columns[0].result?.state).toBe(
          resultState,
        );
      } else if (["migration_hold", "migrated", "active"].includes(step)) {
        await h.db.query(`UPDATE projects SET "writeMode"=$1 WHERE id='project-a'`, [step]);
        readOnly = step !== "active";
      } else if (step === "expire") {
        await h.db.query(
          `UPDATE model_playground_columns SET "leaseExpiresAt"=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE "runId"=$1`,
          [run.id],
        );
        expect(await h.store.expireDispatched(claimed())).toBe(true);
        terminal = false;
      } else if (step === "elapsed") {
        // Backdate immutable dispatch timing only to simulate an elapsed wall-clock window.
        await withoutFixtureTrigger(
          h.db,
          "model_playground_columns",
          "model_playground_column_integrity",
          async () => {
            await h.db.query(
              `UPDATE model_playground_columns SET "dispatchStartedAt"=CURRENT_TIMESTAMP-INTERVAL '151 seconds' WHERE "runId"=$1`,
              [run.id],
            );
          },
        );
        terminal = true;
      } else if (step === "too_large" || step === "conflict") {
        failure = step;
        shared.oversized = step === "too_large";
        shared.invalid = step === "conflict";
      } else if (step === "context_repaired") {
        failure = null;
        shared.oversized = shared.invalid = false;
      } else if (step === "sweep") {
        expect(await recoverModelPlaygroundReports(h.database)).toMatchObject({
          ok: true,
          attempted: 0,
        });
        const [row] = (
          await h.db.query(
            `SELECT "reportState","reportFailure","reportAttemptedAt" FROM model_playground_runs WHERE id=$1`,
            [run.id],
          )
        ).rows;
        expect(row).toMatchObject({
          reportState: "failed",
          reportFailure: failure,
          reportAttemptedAt: expect.any(Date),
        });
      } else if (step === "break") {
        await h.db.exec(
          `CREATE FUNCTION reject_report() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$; CREATE TRIGGER reject_report BEFORE UPDATE ON model_playground_runs FOR EACH ROW EXECUTE FUNCTION reject_report();`,
        );
        broken = true;
      } else if (step === "repair") {
        await h.db.exec(`DROP TRIGGER reject_report ON model_playground_runs`);
        broken = false;
      } else if (step === "deny") shared.allowed = false;
      else if (step === "allow") shared.allowed = true;
      else if (step === "delete") {
        await h.db.exec(`DELETE FROM agent_reports`);
        expect((await h.store.read("project-a", run.id)).reportId).toBeNull();
        savedId = undefined;
        dismissed = true;
        expect(await recoverModelPlaygroundReports(h.database)).toMatchObject({
          ok: true,
          attempted: 0,
        });
      } else {
        const before = (await h.store.read("project-a", run.id)).columns;
        const reads = shared.reads;
        const save = () =>
          step === "finalize"
            ? finalizeModelPlaygroundReport(run.id)
            : saveModelPlaygroundReportAction(input);
        const responses =
          step === "concurrent" ? await Promise.all([save(), save()]) : [await save()];
        if (step !== "finalize") expect(shared.scopeOptions).toEqual({ allowReadOnly: true });
        for (const response of responses) {
          if (!shared.allowed) {
            expect(response).toEqual({ ok: false, reason: "forbidden" });
            expect(shared.reads).toBe(reads);
          } else if (dismissed) expect(response).toEqual({ ok: false, reason: "dismissed" });
          else if (readOnly && savedId && step === "finalize")
            expect(response).toEqual({ ok: false, reason: "held" });
          else if (readOnly && savedId)
            expect(response).toEqual({ ok: true, reportId: savedId, alreadySaved: true });
          else if (readOnly && !savedId)
            expect(response).toEqual({ ok: false, reason: "read_only" });
          else if (!terminal) expect(response).toEqual({ ok: false, reason: "pending" });
          else if (broken) expect(response).toEqual({ ok: false, reason: "storage" });
          else if (failure) expect(response).toEqual({ ok: false, reason: failure });
          else {
            expect(response).toMatchObject({ ok: true, alreadySaved: Boolean(savedId) });
            if (!response.ok) throw new Error("Expected saved");
            if (savedId) expect(response.reportId).toBe(savedId);
            savedId = response.reportId;
          }
        }
        expect((await h.store.read("project-a", run.id)).columns).toEqual(before);
        const reports = (
          await h.db.query<{
            body: { results: { answer: string | null }[]; brandsCapturedAt: string };
          }>(`SELECT body FROM agent_reports`)
        ).rows;
        expect(reports).toHaveLength(savedId ? 1 : 0);
        if (savedId) {
          expect(reports[0].body.results[0].answer).toBe(before[0].result?.answer ?? null);
          expect(reports[0].body.brandsCapturedAt).toBeTruthy();
        }
      }
    }
  },
);
it("explicitly classifies every stored state with no permissive fallback", () => {
  expect(REPORT_TERMINAL_STATES).toEqual([
    "completed",
    "partial",
    "cancelled",
    "failed",
    "unknown",
  ]);
  for (const state of storedColumnStateSchema.options)
    expect(isTerminalReportRun({ columns: [{ state }] })).toBe(
      ["completed", "partial", "cancelled", "failed"].includes(state),
    );
  expect(isTerminalReportRun({ columns: [] })).toBe(false);
});

it("distinguishes invalid report structure from a budget refusal without changing the answer", async () => {
  const run = await h.launch();
  shared.invalid = true;
  expect(await saveModelPlaygroundReportAction({ projectRef: "project-a", runId: run.id })).toEqual(
    {
      ok: false,
      reason: "conflict",
    },
  );
  expect((await h.store.read("project-a", run.id)).columns[0].result?.answer).toBe(result().answer);
  expect((await h.db.query(`SELECT * FROM agent_reports`)).rows).toHaveLength(0);
  shared.invalid = false;
  expect((await finalizeModelPlaygroundReport(run.id)).ok).toBe(true);
});

it("returns nonretryable too_large for a valid stored answer and leaves it intact", async () => {
  const run = await h.launch();
  shared.oversized = true;
  expect(await saveModelPlaygroundReportAction({ projectRef: "project-a", runId: run.id })).toEqual(
    { ok: false, reason: "too_large" },
  );
  expect((await h.store.read("project-a", run.id)).columns[0].result?.answer).toBe(result().answer);
  expect((await h.db.query(`SELECT * FROM agent_reports`)).rows).toHaveLength(0);
  shared.oversized = false;
  expect((await finalizeModelPlaygroundReport(run.id)).ok).toBe(true);
});

it("retained read uses the latest dispatch window and database clock, with authorization first", async () => {
  const run = await h.launch(false);
  const input = { projectRef: "project-a", runId: run.id };
  shared.allowed = false;
  const reads = shared.reads;
  expect(await readModelPlaygroundRetainedResultAction({ ...input, runId: "invalid" })).toEqual({
    ok: false,
    reason: "forbidden",
  });
  expect(shared.reads).toBe(reads);
  shared.allowed = true;
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
  await h.db.query(
    `UPDATE model_playground_columns SET "leaseExpiresAt"=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE "runId"=$1`,
    [run.id],
  );
  await h.store.expireDispatched(identity);
  const [storedDispatch] = (
    await h.db.query<{ dispatchedAt: Date }>(
      `INSERT INTO model_playground_payment_attempts(quote_id,column_id,dispatched_at) VALUES($1,$2,clock_timestamp()) RETURNING dispatched_at AS "dispatchedAt"`,
      [run.previewId, lease.columnId],
    )
  ).rows;
  const dispatchedAt = storedDispatch.dispatchedAt;
  const readinessQueries: string[] = [];
  shared.database = {
    $transaction: (work) =>
      h.database.$transaction((tx) =>
        work({
          $queryRawUnsafe: async <T>(sql: string, ...args: unknown[]) => {
            if (sql.includes('AS "readyInMs"')) readinessQueries.push(sql);
            return tx.$queryRawUnsafe<T>(sql, ...args);
          },
        }),
      ),
  };
  const read = await readModelPlaygroundRetainedResultAction(input);
  expect(readinessQueries).toHaveLength(1);
  expect(readinessQueries[0].match(/clock_timestamp\(\)/g)).toHaveLength(1);
  expect(read).toMatchObject({
    ok: true,
    terminal: false,
    columns: [],
    readyAt: expect.any(String),
    readyInMs: expect.any(Number),
  });
  if (!read.ok || !("readyAt" in read)) throw new Error("Expected readyAt");
  expect(read.readyInMs).toBeGreaterThan(0);
  expect(read.readyInMs).toBeLessThanOrEqual(150000);
  expect(Date.parse(read.readyAt as string)).toBeGreaterThanOrEqual(+dispatchedAt + 150000 - 1);
  // Positive control: after the DB window passes the same read becomes terminal without dispatch.
  await withoutFixtureTrigger(
    h.db,
    "model_playground_columns",
    "model_playground_column_integrity",
    async () => {
      await h.db.exec(
        `UPDATE model_playground_columns SET "dispatchStartedAt"=CURRENT_TIMESTAMP-INTERVAL '151 seconds'`,
      );
    },
  );
  await h.db.exec(
    `UPDATE model_playground_payment_attempts SET dispatched_at=CURRENT_TIMESTAMP-INTERVAL '151 seconds'`,
  );
  expect(await readModelPlaygroundRetainedResultAction(input)).toMatchObject({
    ok: true,
    terminal: true,
    readyAt: null,
  });
});
