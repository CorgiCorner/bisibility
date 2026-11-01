import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { key } from "@/lib/metering/store/codec";
import { Prisma as SQL } from "@/lib/metering/store/host-sql";
import { createTransactionBoundStore } from "@/lib/metering/store/transactional";
import { finalReceiptJoin, unknownAccounting } from "@/lib/provider-usage/reconcile-state";
import pg from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { listCloseoutCandidates } from "./list";
import { waitForRowWaiter, waitForSleep } from "./live.test-fixture";
import { type CloseoutManifest, closeoutPolicy, liveConnectionCloseoutPolicy } from "./manifest";
import { planCloseout } from "./plan";
import { closeoutPostgresFixture } from "./postgres.test-fixture";
import { closeoutSnapshot } from "./snapshot";

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
const inTx = <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) =>
  f.db.$transaction(work, { timeout: 30000 });
const slowAudit = () =>
  f.client.query(
    "CREATE FUNCTION fixture_slow_guard_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(1); RETURN NEW; END $$; CREATE TRIGGER fixture_slow_guard_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fixture_slow_guard_audit()",
  );
const dropSlowAudit = () =>
  f.client.query(
    "DROP TRIGGER fixture_slow_guard_audit ON audit_logs; DROP FUNCTION fixture_slow_guard_audit()",
  );

it.each([
  [
    "a switch to hosted credentials",
    "livehostrace",
    `UPDATE provider_connections SET "credentialSource"='hosted' WHERE id=$1`,
  ],
  ["a connection delete", "livedelrace", "DELETE FROM provider_connections WHERE id=$1"],
])("blocks %s until a live apply commits under the facts it read", async (_, cohort, change) => {
  const manifest = await f.liveManifest(cohort);
  const digest = (await f.preview(manifest)).planHash;
  const other = new pg.Client({ connectionString: f.url });
  await other.connect();
  const order: string[] = [];
  await slowAudit();
  try {
    const apply = f.apply(manifest, digest).then((result) => {
      order.push("apply");
      return result;
    });
    await waitForSleep(f);
    const write = other.query(change, [`live-${cohort}`]).then(() => order.push("write"));
    await waitForRowWaiter(f);
    expect(await apply).toMatchObject({ closed: 1, replayed: false });
    await write;
    expect(order).toEqual(["apply", "write"]);
  } finally {
    await dropSlowAudit();
    await other.end();
  }
});

it("refuses an approved live digest after the connection switched to hosted", async () => {
  const manifest = await f.liveManifest("livehostfirst");
  const digest = (await f.preview(manifest)).planHash;
  await f.client.query(
    `UPDATE provider_connections SET "credentialSource"='hosted' WHERE id='live-livehostfirst'`,
  );
  await expect(f.apply(manifest, digest)).rejects.toThrow("hosted connections are refused");
  expect(
    (
      await f.client.query("SELECT count(*) FROM metering_history_closeout WHERE operation_id=$1", [
        "legacy:livehostfirst-a",
      ])
    ).rows[0].count,
  ).toBe("0");
});

it("refuses a connection re-created after the snapshot, which has no retained snapshot row", async () => {
  await f.client.query(
    `INSERT INTO provider_connections(id,"publicId","projectId",kind,provider,status,"updatedAt") VALUES('retired-native','conn_aaaaaaaaaaaaaaaaaaaaaaaa','native','serp','dataforseo','connected',now())`,
  );
  await expect(f.preview(await f.liveManifest("native", ["a"], "retired-native"))).rejects.toThrow(
    "exactly one retained connection snapshot",
  );
  await expect(f.preview(await f.manifest("native"))).rejects.toThrow("Only a retired connection");
});

it("lists nothing actionable for a retired project whose connection still exists", async () => {
  await f.client.query("DELETE FROM projects WHERE id='retiredconn'");
  const listed = await inTx((tx) =>
    listCloseoutCandidates(tx, {
      namespace: f.namespace,
      retiredProjectId: "retiredconn",
      connection: "live-liveowner",
    }),
  );
  expect(listed).toMatchObject({
    policy: null,
    ineligible: "retired_project_requires_retired_connection",
    operations: [],
    nextAfter: null,
  });
});

/** Correct an original import through the Store, then try to record a disposition for it. */
async function correctThenRecord(
  tx: Prisma.TransactionClient,
  manifest: CloseoutManifest,
  receiptPolicy: string,
  rowPolicy: string,
) {
  const snapshot = await closeoutSnapshot(tx, manifest);
  const correction = planCloseout(snapshot, manifest, new Date()).corrections[0]!;
  const receipt = correction.receipt as typeof correction.receipt & {
    metadata: { historicalCloseout: { policy: string } };
  };
  receipt.metadata.historicalCloseout.policy = receiptPolicy;
  const store = await createTransactionBoundStore({
    transaction: tx,
    clock: { now: () => new Date() },
  });
  const result = await store.correct(correction);
  if (result.outcome !== "settled") throw new Error("Store refused the fixture correction");
  const journal = snapshot.entries[0]!.journal;
  await tx.$executeRaw`INSERT INTO metering_history_closeout
    (operation_pk,namespace,operation_id,migration_id,source_id,source_hash,target_hash,original_receipt_id,receipt_id,version,policy,disposition,body,recorded_at)
    VALUES(${key(f.namespace, correction.operationId)},${f.namespace},${correction.operationId},'20261011021000_accounting_history',${journal.source_id},${journal.source_hash},${journal.target_hash},${correction.replacesReceiptId},${correction.receipt.id},${result.operation.version},${rowPolicy},'financially_closed_identity_incomplete','{}'::jsonb,${new Date(manifest.recordedAt)})`;
  return correction.operationId;
}
const rolledBack = async (work: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
  await expect(
    inTx(async (tx) => {
      await work(tx);
      throw new Error("owned rollback");
    }),
  ).rejects.toThrow(/^owned rollback$/);
};
const unknownCount = (tx: Prisma.TransactionClient, operationId: string) =>
  tx
    .$queryRaw<{ count: bigint }[]>(
      SQL.sql`SELECT count(*) FROM metering_operation o ${finalReceiptJoin} WHERE o.namespace=${f.namespace} AND o.operation_id=${operationId} AND ${unknownAccounting}`,
    )
    .then((rows) => rows[0]!.count);

it("rejects an unknown policy in the disposition CHECK even when receipt metadata agrees", async () => {
  const manifest = await f.manifest("bulk", ["000"]);
  await expect(
    inTx((tx) => correctThenRecord(tx, manifest, "guessed-policy", "guessed-policy")),
  ).rejects.toThrow(/metering_history_closeout_policy_check/);
});

it("rejects a disposition whose policy differs from its receipt metadata, and never resolves it", async () => {
  const manifest = await f.manifest("bulk", ["001"]);
  await expect(
    inTx((tx) => correctThenRecord(tx, manifest, closeoutPolicy, liveConnectionCloseoutPolicy)),
  ).rejects.toThrow(/exact financially settled original correction/);
  // Even with the binding trigger bypassed, the predicate requires matching policies.
  await rolledBack(async (tx) => {
    await tx.$executeRaw`ALTER TABLE metering_history_closeout DISABLE TRIGGER metering_closeout_binding`;
    const mismatched = await correctThenRecord(
      tx,
      manifest,
      closeoutPolicy,
      liveConnectionCloseoutPolicy,
    );
    expect(await unknownCount(tx, mismatched)).toBe(1n);
    const control = await correctThenRecord(
      tx,
      await f.manifest("bulk", ["002"]),
      liveConnectionCloseoutPolicy,
      liveConnectionCloseoutPolicy,
    );
    expect(await unknownCount(tx, control)).toBe(0n);
  });
  expect(
    (
      await f.client.query(
        "SELECT count(*) FROM metering_history_closeout WHERE operation_id LIKE 'legacy:bulk-%'",
      )
    ).rows[0].count,
  ).toBe("0");
});
