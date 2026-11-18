import type { Prisma } from "@/lib/generated/prisma/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ModelPaymentDatabase } from "./admission-storage";
import { launchHarness } from "./launch.test-support";
import { previewModelPlayground } from "./preview";
import { sweepModelPlaygroundRecovery } from "./recovery-schedule";
import * as reportFinalize from "./report-finalize";
import * as repair from "./report-recovery";
import { modelPlaygroundRuntimeBindings } from "./runtime-bindings";
import { executeModelPlaygroundRun } from "./worker";

vi.mock("./report-context", () => ({ loadModelReportEntities: async () => [] }));

const h = launchHarness();
let prior: typeof modelPlaygroundRuntimeBindings.onTerminal;
beforeEach(() => {
  prior = modelPlaygroundRuntimeBindings.onTerminal;
});
afterEach(() => {
  if (prior === undefined) delete modelPlaygroundRuntimeBindings.onTerminal;
  else modelPlaygroundRuntimeBindings.onTerminal = prior;
  vi.restoreAllMocks();
});

function measuredDatabase() {
  const cost = { transactions: 0, queries: 0 };
  const db: ModelPaymentDatabase = {
    $transaction: ((work: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
      cost.transactions++;
      return h.runtime.db.$transaction((tx) =>
        work(
          new Proxy(tx, {
            get(target, key) {
              const member = Reflect.get(target, key);
              if (typeof member !== "function") return member;
              return (...args: unknown[]) => {
                if (String(key).startsWith("$queryRaw") || String(key).startsWith("$executeRaw"))
                  cost.queries++;
                return Reflect.apply(member, target, args);
              };
            },
          }),
        ),
      );
    }) as ModelPaymentDatabase["$transaction"],
  };
  return { db, cost };
}

test.each(["empty", "stopped", "hook", "report"] as const)(
  "one sweep measures and preserves isolated %s work",
  async (kind) => {
    const hook = vi.fn(async (_db: unknown, { revision }: { revision: number }) => ({ revision }));
    let runId: string | undefined;
    if (kind !== "empty") {
      const quote = await previewModelPlayground(h.runtime, { revision: "test", input: h.input });
      const run = await h.admitOnly(quote);
      runId = run.id;
      if (kind === "stopped")
        h.pause(async () => {
          throw new Error("Lost paid response");
        });
      await executeModelPlaygroundRun(h.runtime, { projectId: h.context.projectId, runId });
      if (kind === "stopped") {
        await h.ageDispatches();
        await h.expireLeases();
      }
      if (kind === "report") {
        vi.mocked(reportFinalize.finalizeModelPlaygroundReport).mockRestore();
        await h.sql.exec(`ALTER TABLE agent_reports ADD COLUMN "publicId" text UNIQUE,
          ADD COLUMN kind text, ADD COLUMN title text, ADD COLUMN body jsonb,
          ADD COLUMN provenance jsonb, ADD COLUMN "createdById" text,
          ADD COLUMN "createdAt" timestamp DEFAULT CURRENT_TIMESTAMP`);
        await h.sql.query(
          `UPDATE model_playground_runs SET "terminalHookDeliveredRevision"="terminalRevision",
          "reportState"='failed',"reportFailure"='storage',
          "reportAttemptedAt"=(clock_timestamp() AT TIME ZONE 'UTC')-INTERVAL '301 seconds' WHERE id=$1`,
          [runId],
        );
      }
    }
    const answers = (
      await h.sql.query('SELECT result FROM model_playground_columns ORDER BY "runId","columnId"')
    ).rows;
    modelPlaygroundRuntimeBindings.onTerminal = hook;
    const report = vi.spyOn(repair, "recoverModelPlaygroundReports");
    const { db, cost } = measuredDatabase();
    await sweepModelPlaygroundRecovery(db);
    process.stdout.write(`sweep-cost ${JSON.stringify({ kind, ...cost })}\n`);
    if (kind === "empty") expect(cost).toEqual({ transactions: 1, queries: 1 });
    expect(h.calls).toHaveLength(kind === "empty" ? 0 : 1);
    expect(
      (await h.sql.query('SELECT result FROM model_playground_columns ORDER BY "runId","columnId"'))
        .rows,
    ).toEqual(answers);
    if (kind === "stopped") {
      expect(
        (
          await h.sql.query<{ state: string }>(
            'SELECT state FROM model_playground_columns WHERE "runId"=$1',
            [runId],
          )
        ).rows[0].state,
      ).toBe("unknown");
      expect(hook).toHaveBeenCalledTimes(1);
    } else if (kind === "hook") {
      expect(hook).toHaveBeenCalledTimes(1);
      const [run] = (
        await h.sql.query<{ delivered: number; revision: number }>(
          `SELECT "terminalHookDeliveredRevision" AS delivered,"terminalRevision" AS revision
         FROM model_playground_runs WHERE id=$1`,
          [runId],
        )
      ).rows;
      expect(run.delivered).toBe(run.revision);
    } else if (kind === "report") {
      expect(hook).not.toHaveBeenCalled();
      expect(report).toHaveBeenCalledTimes(1);
      expect(await report.mock.results[0].value).toMatchObject({
        ok: true,
        attempted: 1,
        saved: 1,
      });
      expect(
        (await h.sql.query('SELECT "reportState" FROM model_playground_runs WHERE id=$1', [runId]))
          .rows,
      ).toEqual([{ reportState: "saved" }]);
    } else {
      expect(hook).not.toHaveBeenCalled();
    }
  },
);
