import type { PrismaClient } from "@/lib/generated/prisma/client";
import { preparePaidAttempt } from "@/lib/metering/current-paid-quote";
import { PaidAttemptAdmissionError } from "@/lib/metering/paid-attempt-types";
import { createPostgresStore } from "@/lib/metering/store";
import { currentBudgets, saveBudget } from "@/lib/metering/store/budgets";
import { createSql } from "@/lib/metering/store/host-sql";
import { insert } from "@/lib/metering/store/records";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import {
  admit,
  admitPaid,
  connectionRow,
  gateLimits,
  operationState,
  paidInput,
  unknownOnConnection,
  waitForAdvisoryWaiter,
  waitForSleep,
} from "./live.test-fixture";
import { closeoutPolicy, liveConnectionCloseoutPolicy } from "./manifest";
import { closeoutPostgresFixture } from "./postgres.test-fixture";

const shared = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return shared.db;
  },
}));
let f: Awaited<ReturnType<typeof closeoutPostgresFixture>>;
beforeAll(async () => {
  f = await closeoutPostgresFixture({
    migrationsRoot: process.env.BISIBILITY_TEST_MIGRATIONS_ROOT,
    live: true,
  });
  shared.db = f.db;
}, 60000);
afterAll(async () => {
  if (f) await f.close();
});
const closed = (operationId: string) =>
  f.client
    .query("SELECT policy,disposition FROM metering_history_closeout WHERE operation_id=$1", [
      operationId,
    ])
    .then((r) => r.rows);

it("closes on a live BYOK connection only under the live policy and reopens paid work after the last unknown", async () => {
  expect(f.appliedMigrations).toContain(
    "20261027210000_historical_closeout_live_connection_policy",
  );
  const v1 = await f.manifest("livegate", ["a"], {
    policy: closeoutPolicy,
    connection: "live-livegate",
  });
  await expect(f.preview(v1)).rejects.toThrow("Only a retired connection is eligible.");
  const connection = await connectionRow(f, "livegate");
  const first = await f.liveManifest("livegate", ["a"]);
  const preview = await f.preview(first);
  expect(preview).toMatchObject({ policy: liveConnectionCloseoutPolicy, applyReady: true });
  expect(await f.apply(first, preview.planHash)).toMatchObject({ closed: 1, replayed: false });
  expect(await closed("legacy:livegate-a")).toEqual([
    { policy: liveConnectionCloseoutPolicy, disposition: "financially_closed_identity_incomplete" },
  ]);
  // The predicate accepts the live disposition; one remaining unresolved op keeps both gates shut.
  expect(await unknownOnConnection(f, "livegate")).toBe(1n);
  expect(await gateLimits(f, "livegate")).toMatchObject({
    group: { value: 0n },
    connection: { value: 0n },
  });
  await expect(admitPaid(f, "livegate")).rejects.toBeInstanceOf(PaidAttemptAdmissionError);
  const second = await f.liveManifest("livegate", ["b"]);
  const last = await f.preview(second);
  expect(await f.apply(second, last.planHash)).toMatchObject({ closed: 1 });
  expect(await unknownOnConnection(f, "livegate")).toBe(0n);
  expect(await gateLimits(f, "livegate")).toEqual({ group: null, connection: null });
  expect(await connectionRow(f, "livegate")).toEqual(connection);
  const [admitted] = await admitPaid(f, "livegate");
  expect(admitted?.operation.state).toBe("reserved");
  const after = await operationState(f, admitted!.operation.operationId);
  expect(await f.apply(second, last.planHash)).toMatchObject({ replayed: true });
  expect(await operationState(f, admitted!.operation.operationId)).toEqual(after);
  const audit = (
    await f.client.query(
      "SELECT after FROM audit_logs WHERE action='instance_admin.metering_history_closed' AND \"projectId\"='livegate'",
    )
  ).rows;
  expect(audit).toHaveLength(2);
  for (const row of audit)
    expect(row.after).toMatchObject({
      policy: liveConnectionCloseoutPolicy,
      connection: "live-livegate",
    });
  expect(audit[0].after).not.toHaveProperty("retiredProjectId");
});

it("refuses hosted, foreign, deleted, natively bound and cross-connection operations", async () => {
  await f.client.query(
    `UPDATE provider_connections SET "credentialSource"='hosted' WHERE id='live-livehosted'`,
  );
  await expect(f.preview(await f.liveManifest("livehosted"))).rejects.toThrow(
    "hosted connections are refused",
  );
  await expect(
    f.preview(await f.liveManifest("liveforeign", ["a"], "live-liveowner")),
  ).rejects.toThrow("belong to the manifest project");
  await f.client.query("DELETE FROM provider_connections WHERE id='live-livedeleted'");
  await expect(f.preview(await f.liveManifest("livedeleted"))).rejects.toThrow(
    "requires the existing connection",
  );
  const retired = await f.manifest("livedeleted", ["a"], {
    policy: closeoutPolicy,
    connection: "live-livedeleted",
  });
  await expect(f.preview(retired)).rejects.toThrow("Active, revised");
  await f.client.query(
    "INSERT INTO metering_paid_attempt_context(namespace,operation_id,principal,context) SELECT namespace,operation_id,principal,'{}'::jsonb FROM metering_operation WHERE operation_id='legacy:livenative-a'",
  );
  await expect(f.preview(await f.liveManifest("livenative"))).rejects.toThrow("Active, revised");
  await expect(f.preview(await f.liveManifest("livemixed", ["a", "b"]))).rejects.toThrow(
    "Historical project, connection or namespace mismatch",
  );
  expect(
    (
      await f.client.query(
        "SELECT count(*) FROM metering_history_closeout WHERE operation_id LIKE 'legacy:live%' AND operation_id NOT LIKE 'legacy:livegate-%'",
      )
    ).rows[0].count,
  ).toBe("0");
});

it("leaves post-cutoff work on the same connection untouched, unclosable and still gating", async () => {
  const manifest = await f.liveManifest("livepost");
  const preview = await f.preview(manifest);
  const store = await createPostgresStore({ prisma: f.db, clock: { now: () => new Date() } });
  // The closed gate refuses every new reservation on this connection and leaves no operation.
  const paid = preparePaidAttempt(await paidInput(f, "livepost", "post-cutoff-paid"));
  expect((await store.reserve(paid)).outcome).toBe("exceeded");
  expect(await operationState(f, "post-cutoff-paid")).toEqual([]);
  // Simulate dispatched post-cutoff work awaiting its receipt, via the Store's own row writer.
  const now = new Date().toISOString();
  const later = preparePaidAttempt(await paidInput(f, "livepost", "post-cutoff-op"));
  await f.db.$transaction((tx) =>
    insert(
      createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 }),
      {
        ...later,
        state: "pending",
        version: 1,
        receipts: [],
        lease: null,
        budgetEpochs: [],
        createdAt: now,
        updatedAt: now,
        reservationExpiresAt: new Date(Date.now() + 60000).toISOString(),
      },
      [],
      [],
    ),
  );
  const before = await operationState(f, "post-cutoff-op");
  expect(await f.apply(manifest, preview.planHash)).toMatchObject({ closed: 1 });
  expect(await operationState(f, "post-cutoff-op")).toEqual(before);
  expect(await closed("post-cutoff-op")).toEqual([]);
  expect(await unknownOnConnection(f, "livepost")).toBe(1n);
  expect((await gateLimits(f, "livepost")).connection).toMatchObject({ value: 0n });
  const forged = {
    ...manifest,
    recordedAt: new Date().toISOString(),
    operations: [{ operationId: "post-cutoff-op", expectedVersion: 1, receiptId: "none" }],
  };
  await expect(f.preview(forged)).rejects.toThrow("unique original import");
});

it("serializes concurrent live applies, rejects a stale digest and rolls back audit failure", async () => {
  const race = await f.liveManifest("liverace");
  const digest = (await f.preview(race)).planHash;
  const results = await Promise.all([f.apply(race, digest), f.apply(race, digest)]);
  expect(results.map((r) => r.replayed).sort()).toEqual([false, true]);
  const stale = await f.liveManifest("livestale");
  const approved = (await f.preview(stale)).planHash;
  await f.db.$transaction(async (tx) => {
    const sql = createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 });
    const budget = (await currentBudgets(sql, f.namespace)).find(
      (b) => b.id === "project:livestale:monthly",
    )!;
    await saveBudget(sql, { ...budget, version: budget.version + 1, limit: null });
  });
  await expect(f.apply(stale, approved)).rejects.toThrow("Preview changed");
  const audit = await f.liveManifest("liveaudit");
  const auditDigest = (await f.preview(audit)).planHash;
  const connection = await connectionRow(f, "liveaudit");
  await f.client.query(
    "CREATE FUNCTION fixture_reject_live_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'owned live audit failure'; END $$; CREATE TRIGGER fixture_reject_live_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fixture_reject_live_audit()",
  );
  try {
    await expect(f.apply(audit, auditDigest)).rejects.toThrow("owned live audit failure");
  } finally {
    await f.client.query(
      "DROP TRIGGER fixture_reject_live_audit ON audit_logs; DROP FUNCTION fixture_reject_live_audit()",
    );
  }
  expect(await closed("legacy:liveaudit-a")).toEqual([]);
  expect(await operationState(f, "legacy:liveaudit-a")).toMatchObject([
    { state: "pending", version: 1 },
  ]);
  expect(await gateLimits(f, "liveaudit")).toMatchObject({ connection: { value: 0n } });
  expect(await connectionRow(f, "liveaudit")).toEqual(connection);
});

it("serializes with concurrent paid admission on the same live connection in both orders", async () => {
  const manifest = await f.liveManifest("livelock");
  const digest = (await f.preview(manifest)).planHash;
  let release!: () => void;
  let entered!: () => void;
  const barrier = new Promise<void>((resolve) => (release = resolve));
  const holding = new Promise<void>((resolve) => (entered = resolve));
  const input = await paidInput(f, "livelock");
  // Admission first: it keeps the connection accounting lock while the closed gate refuses it.
  const admission = f.db.$transaction(
    async (tx) => {
      const outcome = await admit(tx, input).catch((error: unknown) => error);
      entered();
      await barrier;
      return outcome;
    },
    { timeout: 30000 },
  );
  await holding;
  const apply = f.apply(manifest, digest);
  await waitForAdvisoryWaiter(f);
  release();
  expect(await admission).toBeInstanceOf(PaidAttemptAdmissionError);
  expect(await apply).toMatchObject({ closed: 1, replayed: false });
  // Apply first: a slow atomic audit keeps the apply open while new paid work waits behind it.
  const waitManifest = await f.liveManifest("livewait");
  const waitDigest = (await f.preview(waitManifest)).planHash;
  await f.client.query(
    "CREATE FUNCTION fixture_slow_live_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(1); RETURN NEW; END $$; CREATE TRIGGER fixture_slow_live_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fixture_slow_live_audit()",
  );
  try {
    const slow = f.apply(waitManifest, waitDigest);
    await waitForSleep(f);
    const waiting = await paidInput(f, "livewait");
    const later = f.db.$transaction((tx) => admit(tx, waiting), { timeout: 30000 });
    await waitForAdvisoryWaiter(f);
    expect(await slow).toMatchObject({ closed: 1, replayed: false });
    expect((await later)[0]?.operation.state).toBe("reserved");
  } finally {
    await f.client.query(
      "DROP TRIGGER fixture_slow_live_audit ON audit_logs; DROP FUNCTION fixture_slow_live_audit()",
    );
  }
  expect(await gateLimits(f, "livewait")).toEqual({ group: null, connection: null });
});
