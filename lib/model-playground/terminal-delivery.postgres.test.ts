import * as meters from "@/lib/metering/transaction-meter";
import { recordModelDispatchEvidence } from "@/lib/provider-usage/model-accounting";
import { dispatchModelPlaygroundIntents } from "@/lib/worker-intents/model-playground";
import { afterEach, expect, type Mock, test, vi } from "vitest";
import { migrationSql } from "./admission.postgres.test-support";
import { readModelAttempts } from "./admission-storage";
import { executeModelPlayground } from "./execute";
import { launchHarness } from "./launch.test-support";
import { previewModelPlayground } from "./preview";
import * as receipts from "./receipt";
import { modelPlaygroundRuntimeBindings } from "./runtime-bindings";
import type { ModelPlaygroundRuntime } from "./runtime-contract";
import { finalizeModelPlaygroundExecution, recoverModelPlaygroundTerminalHooks } from "./terminal";
import { executeModelPlaygroundRun } from "./worker";

const h = launchHarness();
afterEach(() => {
  vi.restoreAllMocks();
  delete modelPlaygroundRuntimeBindings.onTerminal;
});
async function admitted() {
  const q = await previewModelPlayground(h.runtime, { revision: "test", input: h.input });
  const run = await h.admitOnly(q);
  const attempts = await h.runtime.db.$transaction((tx) => readModelAttempts(tx, q.previewId));
  return { projectId: h.context.projectId, runId: run.id, attempts };
}
const revisions = async () =>
  (
    await h.sql.query<{ terminalRevision: number; terminalHookDeliveredRevision: number }>(
      'SELECT "terminalRevision","terminalHookDeliveredRevision" FROM model_playground_runs',
    )
  ).rows[0];

test("receipt retains only after accounting and never calls the hook inside paid settle", async () => {
  const input = await admitted();
  const order: string[] = [];
  const createTransactionMeter = meters.createTransactionMeter;
  const retain = receipts.retainModelReceiptColumn;
  vi.spyOn(receipts, "retainModelReceiptColumn").mockImplementation(async (...args) => {
    order.push("receipt");
    return retain(...args);
  });
  vi.spyOn(meters, "createTransactionMeter").mockImplementation(async (...args) => {
    const meter = await createTransactionMeter(...args);
    const settle = meter.settle.bind(meter);
    meter.settle = async (...values) => {
      const result = await settle(...values);
      order.push("meter");
      return result;
    };
    return meter;
  });
  let inside = false;
  const generate = h.adapter.generate.bind(h.adapter);
  h.adapter.generate = async (...args) => {
    inside = true;
    try {
      return await generate(...args);
    } finally {
      inside = false;
      order.push("answer");
    }
  };
  h.runtime.onTerminal = vi.fn(async (_db, { revision }) => {
    expect(inside).toBe(false);
    order.push("hook");
    return { revision };
  });
  modelPlaygroundRuntimeBindings.onTerminal = h.runtime.onTerminal;
  try {
    expect((await executeModelPlayground(h.runtime, input))[0].result?.answer).toBeTruthy();
    expect(order).toEqual(["meter", "receipt", "answer", "hook"]);
  } finally {
    h.adapter.generate = generate;
  }
});

test("settlement-only change bumps revision and create-once hook refreshes from current columns", async () => {
  const input = await admitted();
  const { reportedResult } = await import("./usage.test-support");
  h.answer((answer) => ({ ...reportedResult(), column: answer.column }));
  let saved: { revision: number; accounting: string } | undefined;
  const hook: NonNullable<ModelPlaygroundRuntime["onTerminal"]> = async (_db, { revision }) => {
    const accounting = (
      await h.sql.query<{ accounting_status: string }>(
        "SELECT accounting_status FROM model_playground_payment_observations",
      )
    ).rows[0].accounting_status;
    // A create-once report must explicitly rebuild when its delivered revision advances.
    if (!saved || revision > saved.revision) saved = { revision, accounting };
    return { revision: saved.revision };
  };
  h.runtime.onTerminal = hook;
  const real = meters.createTransactionMeter;
  const broken = vi.spyOn(meters, "createTransactionMeter").mockImplementation(async (...args) => {
    const meter = await real(...args);
    meter.settle = async () => {
      throw new Error("Accounting outage");
    };
    return meter;
  });
  await executeModelPlayground(h.runtime, input);
  broken.mockRestore();
  expect(saved?.accounting).toBe("pending");
  const before = await revisions();
  const response = (
    await h.sql.query<{ response: import("./types").ModelColumnResult }>(
      "SELECT response FROM model_playground_payment_observations",
    )
  ).rows[0].response;
  expect(
    await recordModelDispatchEvidence(h.runtime.db, input.attempts[0].id, response),
  ).toMatchObject({ accountingStatus: "settled" });
  expect((await revisions()).terminalRevision).toBeGreaterThan(before.terminalRevision);
  expect(saved?.accounting).toBe("pending");
  await recoverModelPlaygroundTerminalHooks(h.runtime);
  expect(saved).toMatchObject({
    accounting: "settled",
    revision: (await revisions()).terminalRevision,
  });
  const after = await revisions();
  await recordModelDispatchEvidence(h.runtime.db, input.attempts[0].id, response);
  expect(await revisions()).toEqual(after);
  expect(h.calls).toHaveLength(1);
});

test("hook acknowledges only its revision and integer token fences an old concurrent claim", async () => {
  const input = await admitted();
  await executeModelPlaygroundRun(h.runtime, input);
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((done) => {
    release = done;
  });
  const ready = new Promise<void>((done) => {
    entered = done;
  });
  let deliveries = 0;
  const hook: Mock<NonNullable<ModelPlaygroundRuntime["onTerminal"]>> = vi.fn(
    async (_db, { revision }) => {
      const ordinal = ++deliveries;
      if (ordinal === 1) {
        entered();
        await gate;
      }
      return { revision: ordinal === 2 ? 0 : revision };
    },
  );
  h.runtime.onTerminal = hook;
  const first = finalizeModelPlaygroundExecution(h.runtime, input);
  await ready;
  await h.sql.exec(
    "UPDATE model_playground_runs SET \"terminalHookNextAt\"=clock_timestamp()-INTERVAL '1 second'",
  );
  // Timestamp equality must be irrelevant, including sessions outside UTC.
  await h.sql.exec("SET TIME ZONE 'Pacific/Honolulu'");
  await finalizeModelPlaygroundExecution(h.runtime, input);
  const delivered = await revisions();
  try {
    expect(delivered.terminalHookDeliveredRevision).toBe(0);
  } finally {
    release();
    await first;
  }
  expect(hook).toHaveBeenCalledTimes(2);
  expect(await revisions()).toEqual(delivered);
  await h.sql.exec('UPDATE model_playground_runs SET "terminalHookNextAt"=NULL');
  await finalizeModelPlaygroundExecution(h.runtime, input);
  expect(hook).toHaveBeenCalledTimes(3);
  const final = await revisions();
  expect(final.terminalHookDeliveredRevision).toBe(final.terminalRevision);
});

test("a hook acknowledging an older revision is never marked delivered and gives up visibly", async () => {
  const input = await admitted();
  await executeModelPlaygroundRun(h.runtime, input);
  const hook = vi.fn(async () => ({ revision: 0 }));
  h.runtime.onTerminal = hook;
  for (let i = 0; i < 7; i++) {
    await h.sql.exec('UPDATE model_playground_runs SET "terminalHookNextAt"=NULL');
    await recoverModelPlaygroundTerminalHooks(h.runtime);
  }
  expect(hook).toHaveBeenCalledTimes(5);
  expect((await revisions()).terminalHookDeliveredRevision).toBe(0);
  expect(
    (
      await h.sql.query<{ stopped: boolean }>(
        `SELECT ("terminalHookStoppedAt" IS NOT NULL AND "terminalHookStoppedRevision"="terminalRevision"
          AND "terminalHookDeliveredRevision"<"terminalRevision") AS stopped FROM model_playground_runs`,
      )
    ).rows[0].stopped,
  ).toBe(true);
  expect(h.calls).toHaveLength(1);
});

test("unreported legacy terminal runs are backfilled as delivered without creating historical reports", async () => {
  const input = await admitted();
  await executeModelPlaygroundRun(h.runtime, input);
  await h.sql.exec(`DROP TRIGGER model_playground_delivery_guard ON model_playground_runs;
    DROP FUNCTION guard_model_playground_delivery();
    ALTER TABLE model_playground_runs DROP COLUMN "workerRequestedAt", DROP COLUMN "workerProbeAt", DROP COLUMN "terminalAt",
    DROP COLUMN "terminalRevision", DROP COLUMN "terminalHookDeliveredRevision", DROP COLUMN "terminalHookAttemptAt", DROP COLUMN "terminalHookNextAt",
    DROP COLUMN IF EXISTS "terminalHookAttempts", DROP COLUMN IF EXISTS "terminalHookAttemptBase",
    DROP COLUMN IF EXISTS "terminalHookStoppedAt", DROP COLUMN IF EXISTS "terminalHookStoppedRevision",
    DROP COLUMN IF EXISTS "terminalHookAttemptRevision",
    DROP COLUMN "workerRecoveryAttempts", DROP COLUMN "recoveryStoppedAt"`);
  await h.sql.exec(await migrationSql("20261113200000_model_playground_worker_delivery"));
  const hook = vi.fn(async () => ({ revision: 1 }));
  modelPlaygroundRuntimeBindings.onTerminal = hook;
  await dispatchModelPlaygroundIntents(h.runtime.db, async () => {
    throw new Error("Historical run");
  });
  expect(hook).not.toHaveBeenCalled();
  expect(await revisions()).toEqual({ terminalRevision: 1, terminalHookDeliveredRevision: 1 });
});

test("hook delivery uses an integer token even when its attempt timestamp changes", async () => {
  const input = await admitted();
  await executeModelPlaygroundRun(h.runtime, input);
  h.runtime.onTerminal = async (_db, { revision }) => {
    await h.sql.exec(
      'UPDATE model_playground_runs SET "terminalHookAttemptAt"="terminalHookAttemptAt"+INTERVAL \'1 second\'',
    );
    return { revision };
  };
  await finalizeModelPlaygroundExecution(h.runtime, input);
  const row = await revisions();
  expect(row.terminalHookDeliveredRevision).toBe(row.terminalRevision);
});

test("late receipt during delivery leaves its revision pending until create-once report rebuilds", async () => {
  const input = await admitted();
  h.pause(async () => {
    throw new Error("Lost response");
  });
  expect(await executeModelPlaygroundRun(h.runtime, input)).toMatchObject({ terminal: false });
  await h.ageDispatches();
  await h.sql.exec(
    `UPDATE model_playground_columns SET "leaseExpiresAt"=(clock_timestamp() AT TIME ZONE 'UTC') - INTERVAL '1 second'`,
  );
  let saved: { revision: number; answer: string | null } | undefined;
  const { reportedResult } = await import("./usage.test-support");
  const answer = { ...reportedResult(), column: input.attempts[0].binding.column };
  const hook = vi.fn<NonNullable<ModelPlaygroundRuntime["onTerminal"]>>(
    async (_db, { revision }) => {
      const row = (
        await h.sql.query<{ result: { answer: string } | null }>(
          "SELECT result FROM model_playground_columns",
        )
      ).rows[0];
      if (!saved || revision > saved.revision)
        saved = { revision, answer: row.result?.answer ?? null };
      if (hook.mock.calls.length === 1)
        await recordModelDispatchEvidence(h.runtime.db, input.attempts[0].id, answer);
      return { revision };
    },
  );
  h.runtime.onTerminal = hook;
  expect(await executeModelPlaygroundRun(h.runtime, input)).toEqual({ terminal: true });
  expect(saved).toEqual({ revision: 1, answer: null });
  const pending = await revisions();
  expect(pending.terminalHookDeliveredRevision).toBe(1);
  expect(pending.terminalRevision).toBeGreaterThan(pending.terminalHookDeliveredRevision);
  await recoverModelPlaygroundTerminalHooks(h.runtime);
  expect(saved).toEqual({ revision: (await revisions()).terminalRevision, answer: answer.answer });
  expect((await revisions()).terminalHookDeliveredRevision).toBe(saved?.revision);
  expect(hook).toHaveBeenCalledTimes(2);
  expect(h.calls).toHaveLength(1);
});

test.each([-1, 6, 1.25, null])(
  "hook attempt bounds reject %s after a valid integer control",
  async (value) => {
    await admitted();
    await h.sql.exec('UPDATE model_playground_runs SET "terminalHookAttempts"=2');
    await expect(
      h.sql.query('UPDATE model_playground_runs SET "terminalHookAttempts"=$1', [value]),
    ).rejects.toThrow();
    await expect(
      h.sql.exec('UPDATE model_playground_runs SET "terminalHookAttempts"=1'),
    ).rejects.toThrow("delivery is fenced");
    await h.sql.exec('UPDATE model_playground_runs SET "terminalHookStoppedAt"=clock_timestamp()');
    await expect(
      h.sql.exec('UPDATE model_playground_runs SET "terminalHookStoppedAt"=NULL'),
    ).rejects.toThrow("delivery is fenced");
  },
);
