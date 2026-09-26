import { fork } from "node:child_process";
import { once } from "node:events";
import { expect, test } from "vitest";
import { Prisma } from "./sql";
import { bound, command, receipt, ref, request } from "./test-data";
import { fixture } from "./test-fixture";

test("SIGKILL after intent preserves the lease and accounting for recovery", async () => {
  const f = await fixture();
  await f.store.putBudget(bound());
  const child = fork("lib/metering/store/test-process.ts", [], {
    execArgv: ["--experimental-strip-types", "--import", "./lib/temporal/register-loader.mjs"],
    env: { ...process.env, METERING_TEST_DATABASE_URL: f.url, METERING_TEST_SCHEMA: f.schema },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let diagnostics = "";
  child.stderr?.on("data", (chunk) => {
    diagnostics += String(chunk);
  });
  try {
    const ready = await Promise.race([
      once(child, "message").then(([message]) => message as { ready: boolean; leaseId: string }),
      once(child, "exit").then(() => {
        throw new Error(`Child exited before intent: ${diagnostics}`);
      }),
    ]);
    expect(ready.ready).toBe(true);
    const exited = once(child, "exit");
    child.kill("SIGKILL");
    expect((await exited)[1]).toBe("SIGKILL");
    const store = await f.restart();
    f.clock.advance(61000);
    const op = await store.getOperation(ref(request("restart-operation")));
    expect(op).toMatchObject({
      state: "dispatch_intended",
      receipts: [],
      lease: { leaseId: ready.leaseId },
    });
    if (!op) throw new Error("Missing operation");
    const recovery = await store.claimForRecovery({
      ...ref(op),
      holder: "parent",
      leaseTtlMs: 60000,
    });
    if (!("claimed" in recovery) || !recovery.claimed) throw new Error("Recovery refused");
    expect(
      await store.markDispatchIntent({
        ...command(recovery.operation),
        holder: "parent",
        leaseTtlMs: 60000,
      }),
    ).toMatchObject({ granted: false, reason: "already_dispatched" });
    expect(
      await store.settle({
        ...command(recovery.operation),
        authority: { kind: "recovery", leaseId: recovery.lease.leaseId },
        receipt: receipt(),
      }),
    ).toMatchObject({ outcome: "settled", operation: { state: "settled" } });
    const rows = await f
      .client()
      .$queryRaw<
        { settled_value: { toString(): string }; outstanding_value: { toString(): string } }[]
      >(
        Prisma.sql`SELECT settled_value,outstanding_value FROM ${Prisma.raw(`"${f.schema}".metering_budget_usage`)}`,
      );
    expect(rows.map((r) => [r.settled_value.toString(), r.outstanding_value.toString()])).toEqual([
      ["1", "0"],
    ]);
    console.info(
      "Postgres restart: child reserved and intended, SIGKILL, new client, expired lease, recovery claim, redispatch refused, settled=1 outstanding=0",
    );
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await f.close();
  }
});
