import { randomUUID } from "node:crypto";
import { makePublicId } from "@/lib/db/public-id-resources";
import { fencePaidAttemptsInTransaction } from "@/lib/metering/paid-dispatch";
import { expect, test, vi } from "vitest";
import { workerNativeFixture } from "./worker-native.postgres.test-fixture";

const invocation = vi.hoisted(() => ({ workflowId: "owned-worker", runId: "owned-workflow-run" }));
vi.mock("@temporalio/activity", () => ({
  Context: { current: () => ({ info: { workflowExecution: invocation } }) },
}));
vi.mock("server-only", () => ({}));

function latch() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
async function blocked(f: Awaited<ReturnType<typeof workerNativeFixture>>, pid: number) {
  const until = Date.now() + 3000;
  while (Date.now() < until) {
    const row = await f.client.query("SELECT cardinality(pg_blocking_pids($1))>0 AS blocked", [
      pid,
    ]);
    if (row.rows[0].blocked) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Owned contender did not reach the expected real PostgreSQL lock.");
}
test("two same-project native sends and a settings mutation serialize before accounting locks without a SHARE-to-UPDATE upgrade", async () => {
  const f = await workerNativeFixture(invocation);
  const release = latch();
  const acquired = latch();
  try {
    const a = await f.create();
    const b = await f.create();
    const first = f.db.$transaction((tx) =>
      fencePaidAttemptsInTransaction(tx, [a.grant], {
        beforeFence: {
          ...a.hook,
          async lockBusiness(inner, refs) {
            await a.hook.lockBusiness(inner, refs);
            acquired.release();
            await release.promise;
          },
        },
      }),
    );
    await acquired.promise;
    let writerPid = 0;
    const writerReady = latch();
    const writer = f.db.$transaction(async (tx) => {
      const [pid] = await tx.$queryRaw<Array<{ id: number }>>`SELECT pg_backend_pid() AS id`;
      writerPid = pid.id;
      writerReady.release();
      await tx.projectDefaults.update({
        where: { projectId: f.project.project.id },
        data: { frequency: "weekly" },
      });
    });
    await writerReady.promise;
    await blocked(f, writerPid);
    let secondPid = 0;
    const secondReady = latch();
    const second = f.db.$transaction(async (tx) => {
      const [pid] = await tx.$queryRaw<Array<{ id: number }>>`SELECT pg_backend_pid() AS id`;
      secondPid = pid.id;
      secondReady.release();
      await fencePaidAttemptsInTransaction(tx, [b.grant], { beforeFence: b.hook });
    });
    const secondOutcome = second.then(
      () => "sent",
      (error: unknown) => error,
    );
    await secondReady.promise;
    await blocked(f, secondPid);
    release.release();
    await first;
    await writer;
    expect(await secondOutcome).toMatchObject({ code: "measurement_definition_conflict" });
    const proof = await f.client.query(
      "SELECT operation_id,fenced_at FROM metering_paid_attempt_context WHERE namespace=$1 ORDER BY operation_id",
      [f.namespace],
    );
    expect(
      proof.rows.find((row) => row.operation_id === a.grant.operation.operationId).fenced_at,
    ).not.toBeNull();
    expect(
      proof.rows.find((row) => row.operation_id === b.grant.operation.operationId).fenced_at,
    ).toBeNull();
  } finally {
    release.release();
    await f.close();
  }
});
test("fresh revoked writer blocks the native fence; billing principal is not impersonated as actor", async () => {
  const f = await workerNativeFixture(invocation);
  try {
    const a = await f.create();
    expect(a.grant.operation.scope.principal).toBe(f.project.owner.id);
    await f.db.membership.updateMany({
      where: { projectId: f.project.project.id, userId: f.project.writer.id },
      data: { role: "viewer" },
    });
    await expect(
      f.db.$transaction((tx) =>
        fencePaidAttemptsInTransaction(tx, [a.grant], { beforeFence: a.hook }),
      ),
    ).rejects.toThrow();
    const audit = await f.db.auditLog.findMany({
      where: { action: "measurement_definition.fixture", targetId: f.project.project.publicId },
    });
    expect(audit.at(-1)?.actorId).toBe(f.project.writer.id);
    const proof = await f.client.query(
      "SELECT fenced_at FROM metering_paid_attempt_context WHERE namespace=$1 AND operation_id=$2",
      [f.namespace, a.grant.operation.operationId],
    );
    expect(proof.rows[0].fenced_at).toBeNull();
  } finally {
    await f.close();
  }
});
test("verified scheduled run with null requestedBy retains null audit actor and never chooses the owner", async () => {
  const f = await workerNativeFixture(invocation);
  try {
    const a = await f.create(null);
    await f.db.$transaction((tx) =>
      fencePaidAttemptsInTransaction(tx, [a.grant], { beforeFence: a.hook }),
    );
    const audit = await f.db.auditLog.findMany({
      where: { action: "measurement_definition.fixture", targetId: f.project.project.publicId },
    });
    expect(audit.at(-1)?.actorId).toBeNull();
  } finally {
    await f.close();
  }
});

test("project-key execution keeps the exact original caller through null actor and refuses a later key or origin rewrite", async () => {
  const f = await workerNativeFixture(invocation);
  try {
    const key = () =>
      f.db.apiKey.create({
        data: {
          projectId: f.project.project.id,
          publicId: makePublicId("key"),
          name: "Synthetic caller",
          prefix: "synthetic",
          hashedKey: randomUUID(),
          scopes: ["write"],
        },
      });
    const original = await key();
    const other = await key();
    const a = await f.create(null, original.id);
    expect(a.scope.permit.principal).toMatchObject({
      actorId: null,
      credentialId: original.id,
      credentialKind: "project_key",
    });
    await f.db.$transaction((tx) =>
      fencePaidAttemptsInTransaction(tx, [a.grant], { beforeFence: a.hook }),
    );
    const audit = await f.db.auditLog.findMany({
      where: { action: "measurement_definition.fixture", targetId: f.project.project.publicId },
    });
    expect(audit.at(-1)?.actorId).toBeNull();
    const b = await f.create(null, original.id);
    // Mutability of a legacy attribution field does not replace immutable authenticated launch origin.
    await expect(
      f.db.rankCheckRun.update({ where: { id: b.run.id }, data: { credentialId: other.id } }),
    ).rejects.toThrow("measurement_original_caller_columns_immutable");
    await f.db.apiKey.update({ where: { id: original.id }, data: { scopes: ["read"] } });
    await expect(
      f.db.$transaction((tx) =>
        fencePaidAttemptsInTransaction(tx, [b.grant], { beforeFence: b.hook }),
      ),
    ).rejects.toThrow();
    await expect(
      f.client.query(
        `UPDATE rank_check_runs SET "definitionExecutionOrigin"=jsonb_set("definitionExecutionOrigin",'{credentialId}',to_jsonb($1::text)) WHERE id=$2`,
        [other.id, b.run.id],
      ),
    ).rejects.toThrow("measurement_original_caller_immutable");
    await f.db.apiKey.update({ where: { id: original.id }, data: { scopes: ["write"] } });
    const c = await f.create(null, original.id);
    await f.db.apiKey.update({ where: { id: original.id }, data: { revokedAt: new Date() } });
    await expect(
      f.db.$transaction((tx) =>
        fencePaidAttemptsInTransaction(tx, [c.grant], { beforeFence: c.hook }),
      ),
    ).rejects.toThrow();
    const rows = await f.client.query(
      "SELECT operation_id,fenced_at FROM metering_paid_attempt_context WHERE namespace=$1",
      [f.namespace],
    );
    expect(
      rows.rows.find((row) => row.operation_id === b.grant.operation.operationId).fenced_at,
    ).toBeNull();
    expect(
      rows.rows.find((row) => row.operation_id === c.grant.operation.operationId).fenced_at,
    ).toBeNull();
  } finally {
    await f.close();
  }
});

test("native lease expiry, cancellation and transport replay refuse a second send before semantic proof writes", async () => {
  const f = await workerNativeFixture(invocation);
  const transport = vi.fn(async () => undefined);
  try {
    const a = await f.create();
    const send = async () => {
      await f.db.$transaction((tx) =>
        fencePaidAttemptsInTransaction(tx, [a.grant], { beforeFence: a.hook }),
      );
      await transport();
    };
    await send();
    await expect(send()).rejects.toThrow();
    expect(transport).toHaveBeenCalledOnce();
    const b = await f.create();
    await f.client.query(
      `UPDATE metering_operation SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE namespace=$1 AND operation_id=$2`,
      [f.namespace, b.grant.operation.operationId],
    );
    await expect(
      f.db.$transaction((tx) =>
        fencePaidAttemptsInTransaction(tx, [b.grant], { beforeFence: b.hook }),
      ),
    ).rejects.toThrow("lease expired");
    const c = await f.create();
    await f.db.rankCheckRun.update({ where: { id: c.run.id }, data: { status: "cancelled" } });
    await expect(
      f.db.$transaction((tx) =>
        fencePaidAttemptsInTransaction(tx, [c.grant], { beforeFence: c.hook }),
      ),
    ).rejects.toThrow();
    const proofs = await f.client.query(
      "SELECT count(*)::int AS count FROM measurement_native_dispatch_proofs WHERE namespace=$1",
      [f.namespace],
    );
    expect(proofs.rows[0].count).toBe(1);
    expect(transport).toHaveBeenCalledOnce();
  } finally {
    await f.close();
  }
});
