import { expect, it } from "vitest";
import { invalidProvenance, provenanceResult } from "./attempt-provenance.test-support";
import { columnId } from "./contract-fixtures.test-support";
import { createHarness, present } from "./store.postgres.test-support";

const { db, launch, store, evidence } = createHarness();
function update(value: unknown, runId: string) {
  return db.query(
    `UPDATE model_playground_columns SET state='completed',result=$1::jsonb,"finishedAt"=CURRENT_TIMESTAMP WHERE "runId"=$2`,
    [JSON.stringify(value), runId],
  );
}
async function validControl(value: unknown, runId: string) {
  await db.exec("BEGIN");
  try {
    await expect(update(value, runId)).resolves.toMatchObject({ affectedRows: 1 });
  } finally {
    // Keep the row claimed so the immutable-terminal trigger cannot mask shape checks.
    await db.exec("ROLLBACK");
  }
}
async function prepare() {
  const run = await launch();
  const key = { projectId: "project-a", runId: run.id, columnId };
  const claim = present(await store.claim({ ...key, leaseSeconds: 60 }));
  const lease = { ...key, leaseToken: present(claim.leaseToken) };
  await store.fenceDispatch(lease);
  return { run, lease };
}

it.each([false, true])("round-trips provenance through store and SQL: %s", async (enabled) => {
  const { run, lease } = await prepare();
  const value = enabled ? { ...evidence(), ...provenanceResult() } : evidence();
  await store.complete(lease, value);
  expect((await store.read("project-a", run.id)).columns[0].result).toEqual(value);
});

it.each(invalidProvenance.map((patch, index) => ({ patch, index })))(
  "SQL rejects malformed credential or discard evidence $index",
  async ({ patch }) => {
    const { run } = await prepare();
    const base = { ...evidence(), ...provenanceResult() };
    await validControl(base, run.id);
    await expect(update({ ...base, ...patch }, run.id)).rejects.toMatchObject({
      code: "23514",
      constraint: "model_playground_result_shape",
    });
  },
);

it("SQL requires a dropped component when a discard is reported", async () => {
  const { run } = await prepare();
  const value = { ...evidence(), ...provenanceResult() };
  await validControl(value, run.id);
  const money = value.costEvidence.upstreamInference?.total;
  if (!money) throw new Error("Missing test cost");
  value.costEvidence.upstreamInference = { total: money, input: money, output: money };
  await expect(update(value, run.id)).rejects.toMatchObject({
    code: "23514",
    constraint: "model_playground_result_shape",
  });
});

it("SQL admits the exact attempt bound", async () => {
  const { run, lease } = await prepare();
  const value = provenanceResult();
  value.routingAttemptCredentials.attempts = Array(100).fill(
    value.routingAttemptCredentials.attempts[0],
  );
  await store.complete(lease, value);
  expect((await store.read("project-a", run.id)).columns[0].result).toEqual(value);
});
