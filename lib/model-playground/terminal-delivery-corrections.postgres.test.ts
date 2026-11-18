import { readFileSync } from "node:fs";
import * as meters from "@/lib/metering/transaction-meter";
import { recordModelDispatchEvidence } from "@/lib/provider-usage/model-accounting";
import { beforeModelDispatch } from "@/lib/provider-usage/model-dispatch";
import {
  dispatchModelPlaygroundIntents,
  hasPendingModelPlaygroundIntent,
} from "@/lib/worker-intents/model-playground";
import { afterEach, expect, test, vi } from "vitest";
import { readModelAttempts } from "./admission-storage";
import { result } from "./contract-fixtures.test-support";
import { executeModelPlayground } from "./execute";
import { claimModelDispatch } from "./execution-storage";
import { launchHarness } from "./launch.test-support";
import {
  prepareModelConnections,
  previewModelPlayground,
  resolveModelPaymentContext,
} from "./preview";
import { deliverModelPlaygroundTerminalReport } from "./report-terminal";
import { modelPlaygroundRuntimeBindings } from "./runtime-bindings";
import { recoverStoppedModelPlaygroundRuns } from "./stopped-recovery";
import * as observed from "./store-observed";
import { recoverModelPlaygroundTerminalHooks } from "./terminal";
import type { ModelColumnResult } from "./types";
import { executeModelPlaygroundRun } from "./worker";

const h = launchHarness();
afterEach(() => {
  vi.restoreAllMocks();
  delete modelPlaygroundRuntimeBindings.onTerminal;
});

async function admitted() {
  const quote = await previewModelPlayground(h.runtime, { revision: "test", input: h.input });
  const run = await h.admitOnly(quote);
  const attempts = await h.runtime.db.$transaction((tx) => readModelAttempts(tx, quote.previewId));
  return { projectId: h.context.projectId, runId: run.id, attempts, quoteId: quote.previewId };
}

async function fence(input: Awaited<ReturnType<typeof admitted>>) {
  const access = await h.runtime.authorize("create");
  const connections = await prepareModelConnections(h.runtime, access, h.input);
  const attempt = input.attempts[0];
  await claimModelDispatch(
    h.runtime.db,
    { projectId: input.projectId, runId: input.runId, columnId: attempt.rootColumnId },
    attempt.id,
    (db) =>
      beforeModelDispatch(
        db,
        {
          now: h.runtime.now,
          readCurrent: (tx, quote) =>
            resolveModelPaymentContext(
              h.runtime,
              tx,
              access,
              quote.context.input,
              connections,
              quote,
              attempt.id,
            ),
        },
        attempt.id,
      ),
  );
}

async function deliveryRow() {
  return (
    await h.sql.query<{
      terminal: boolean;
      terminalRevision: number;
      terminalHookDeliveredRevision: number;
      terminalHookAttempts: number;
      stopped: boolean;
    }>(`SELECT "terminalAt" IS NOT NULL AS terminal,"terminalRevision","terminalHookDeliveredRevision",
      "terminalHookAttempts",("terminalHookStoppedAt" IS NOT NULL AND "terminalHookStoppedRevision"="terminalRevision"
        AND "terminalHookDeliveredRevision"<"terminalRevision") AS stopped FROM model_playground_runs`)
  ).rows[0];
}

test("six successive revisions each deliver and none stop", async () => {
  const input = await admitted();
  const hook = vi.fn(async (_db: unknown, { revision }: { revision: number }) => ({ revision }));
  h.runtime.onTerminal = hook;
  expect(await executeModelPlaygroundRun(h.runtime, input)).toEqual({ terminal: true });
  for (let revision = 0; revision < 5; revision++) {
    await h.sql.exec(
      'UPDATE model_playground_runs SET "terminalRevision"="terminalRevision"+1,"terminalHookNextAt"=NULL',
    );
    await recoverModelPlaygroundTerminalHooks(h.runtime);
  }
  const row = await deliveryRow();
  expect(hook).toHaveBeenCalledTimes(6);
  expect(row.stopped).toBe(false);
  expect(row.terminalHookDeliveredRevision).toBe(row.terminalRevision);
  expect(row.terminalRevision).toBe(6);
  expect(row.terminalHookAttempts).toBe(6);
});

test("shared registration installs the report hook, and an unset hook spends no claim", async () => {
  expect(readFileSync("lib/temporal/worker.ts", "utf8")).toContain(
    'import "../model-playground/runtime-registration"',
  );
  expect(readFileSync("instrumentation.ts", "utf8")).toContain(
    'import("./lib/model-playground/runtime-registration")',
  );
  await import("./runtime-registration");
  expect(modelPlaygroundRuntimeBindings.onTerminal).toBe(deliverModelPlaygroundTerminalReport);
  delete modelPlaygroundRuntimeBindings.onTerminal;
  const input = await admitted();
  expect(await executeModelPlaygroundRun(h.runtime, input)).toEqual({ terminal: true });
  const row = await deliveryRow();
  expect(row.terminal).toBe(true);
  expect(row.terminalHookAttempts).toBe(0);
  expect(row.stopped).toBe(false);
  expect(row.terminalHookDeliveredRevision).toBeLessThan(row.terminalRevision);
  expect(await hasPendingModelPlaygroundIntent(h.runtime.db)).toBe(false);
});

test("inline crash after fence then a late receipt terminalizes with delivery still pending", async () => {
  const input = await admitted();
  await fence(input);
  const attempt = input.attempts[0];
  const answer: ModelColumnResult = {
    ...result(),
    column: { ...attempt.binding.column, columnId: attempt.rootColumnId },
    providerRequestId: attempt.id,
  };
  await recordModelDispatchEvidence(h.runtime.db, attempt.id, answer);
  const row = await deliveryRow();
  expect(row.terminal).toBe(true);
  expect(row.terminalHookAttempts).toBe(0);
  expect(row.stopped).toBe(false);
  expect(row.terminalHookDeliveredRevision).toBeLessThan(row.terminalRevision);
  expect(h.calls).toHaveLength(0);
});

test("inline crash after fence with no receipt expires on the recovery sweep", async () => {
  const input = await admitted();
  await fence(input);
  await h.ageDispatches();
  await h.sql.exec(
    `UPDATE model_playground_columns SET "leaseExpiresAt"=(clock_timestamp() AT TIME ZONE 'UTC') - INTERVAL '1 second'`,
  );
  const start = vi.fn(async () => {
    throw new Error("Inline recovery must not execute");
  });
  await recoverStoppedModelPlaygroundRuns(h.runtime.db);
  await dispatchModelPlaygroundIntents(h.runtime.db, start);
  expect(start).not.toHaveBeenCalled();
  const row = await deliveryRow();
  expect(row.terminal).toBe(true);
  expect(row.terminalHookDeliveredRevision).toBeLessThan(row.terminalRevision);
  expect(
    (await h.sql.query<{ state: string }>("SELECT state FROM model_playground_columns")).rows[0]
      .state,
  ).toBe("unknown");
  expect(h.calls).toHaveLength(0);
});

test("in-flight column retention follows accounting", async () => {
  const input = await admitted();
  const order: string[] = [];
  const save = observed.completeObservedModelColumn;
  vi.spyOn(observed, "completeObservedModelColumn").mockImplementation(async (...args) => {
    order.push("column");
    return save(...args);
  });
  const createTransactionMeter = meters.createTransactionMeter;
  vi.spyOn(meters, "createTransactionMeter").mockImplementation(async (...args) => {
    const meter = await createTransactionMeter(...args);
    const settle = meter.settle.bind(meter);
    meter.settle = async (...values) => {
      const settled = await settle(...values);
      order.push("meter");
      return settled;
    };
    return meter;
  });
  expect((await executeModelPlayground(h.runtime, input))[0].result?.answer).toBeTruthy();
  expect(order.indexOf("meter")).toBeGreaterThanOrEqual(0);
  expect(order.indexOf("column")).toBeGreaterThan(order.indexOf("meter"));
});
