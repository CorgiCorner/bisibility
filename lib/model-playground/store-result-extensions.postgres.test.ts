import { expect, it, vi } from "vitest";
import { columnId } from "./contract-fixtures.test-support";
import { withFixtureRestore, withoutFixtureTrigger } from "./launch-database.test-support";
import { createHarness, present } from "./store.postgres.test-support";
import { extendedResult, invalidResultExtensions } from "./store-result.test-support";

const { db, launch, store, evidence } = createHarness();
async function prepare() {
  const run = await launch();
  const key = { projectId: "project-a", runId: run.id, columnId };
  const claim = present(await store.claim({ ...key, leaseSeconds: 60 }));
  const lease = { ...key, leaseToken: present(claim.leaseToken) };
  await store.fenceDispatch(lease);
  return { run, lease };
}

it.each([false, true])("round-trips terminal evidence with extensions=%s", async (enabled) => {
  const { run, lease } = await prepare();
  const value = enabled ? extendedResult(evidence()) : evidence();
  await store.complete(lease, value);
  expect((await store.read("project-a", run.id)).columns[0].result).toEqual(value);
});

it("retains null evidence and the exact 100 consulted-source boundary", async () => {
  const { run, lease } = await prepare();
  const value = extendedResult(evidence());
  value.consultedSources = {
    sources: Array.from({ length: 100 }, (_, i) => ({
      sourceId: `consulted-${i}`,
      url: `https://example.org/${i}`,
      title: null,
    })),
    total: null,
    omitted: null,
    truncated: false,
  };
  value.citationTotals = { total: null, omitted: null };
  value.costEvidence = { providerReported: null, upstreamInference: null, localEstimate: null };
  await store.complete(lease, value);
  expect((await store.read("project-a", run.id)).columns[0].result).toEqual(value);
});

it.each(invalidResultExtensions.map((extension, index) => ({ extension, index })))(
  "rejects malformed result extension $index in SQL",
  async ({ extension }) => {
    const { run } = await prepare();
    await expect(
      db.query(
        `UPDATE model_playground_columns SET state='completed',result=$1::jsonb,"finishedAt"=CURRENT_TIMESTAMP WHERE "runId"=$2`,
        [JSON.stringify({ ...evidence(), ...extension }), run.id],
      ),
    ).rejects.toMatchObject({ code: "23514", constraint: "model_playground_result_shape" });
  },
);

it("keeps the SQL byte budget for a well-shaped extended result", async () => {
  const { run } = await prepare();
  const value = extendedResult(evidence());
  value.answer = "a".repeat(24 * 1024);
  value.consultedSources = {
    sources: Array.from({ length: 100 }, (_, i) => ({
      sourceId: `consulted-${i}`,
      url: `https://example.org/${i}/${"a".repeat(2000)}`,
      title: "a".repeat(512),
    })),
    total: 100,
    omitted: 0,
    truncated: false,
  };
  await expect(
    db.query(
      `UPDATE model_playground_columns SET state='completed',result=$1::jsonb,"finishedAt"=CURRENT_TIMESTAMP WHERE "runId"=$2`,
      [JSON.stringify(value), run.id],
    ),
  ).rejects.toMatchObject({ code: "23514", constraint: "model_playground_result_shape" });
});

it("rejects estimates in reported slots before any SQL", async () => {
  const { lease } = await prepare();
  const query = vi.spyOn(db, "transaction");
  for (const slot of ["providerReported", "upstreamInference"] as const) {
    const value = extendedResult(evidence());
    const estimated = present(value.costEvidence?.localEstimate);
    const costs = present(value.costEvidence);
    if (slot === "providerReported") present(costs.providerReported).money = estimated;
    else present(costs.upstreamInference).input = estimated;
    await expect(store.complete(lease, value)).rejects.toThrow("invalid_snapshot");
  }
  expect(query).not.toHaveBeenCalled();
  query.mockRestore();
});

it("validates new evidence keys again when reading retained results", async () => {
  const { run, lease } = await prepare();
  const value = extendedResult(evidence());
  await store.complete(lease, value);
  const {
    rows: [constraint],
  } = await db.query<{ definition: string }>(
    `SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
     WHERE conname='model_playground_result_shape' AND conrelid='model_playground_columns'::regclass`,
  );
  await withoutFixtureTrigger(db, "model_playground_columns", "USER", async () => {
    await withFixtureRestore(
      async () => {
        await db.exec(
          `ALTER TABLE model_playground_columns DROP CONSTRAINT model_playground_result_shape`,
        );
        await db.query(
          `UPDATE model_playground_columns SET result=jsonb_set(result,'{citationTotals,total}','-1') WHERE "runId"=$1`,
          [run.id],
        );
        await expect(store.read("project-a", run.id)).rejects.toThrow("invalid_snapshot");
      },
      async () => {
        await withFixtureRestore(
          async () => {
            await db.query(
              `UPDATE model_playground_columns SET result=$1::jsonb WHERE "runId"=$2`,
              [JSON.stringify(value), run.id],
            );
          },
          () =>
            db.exec(
              `ALTER TABLE model_playground_columns ADD CONSTRAINT model_playground_result_shape ${constraint.definition}`,
            ),
        );
      },
    );
  });
  expect((await store.read("project-a", run.id)).columns[0].result).toEqual(value);
});

it.each([
  { providerId: "dataforseo" },
  { sourceKind: "consumer_capture" },
  { payment: { optionId: "hosted", fundingSource: "platform" } },
])("rejects excluded column payloads before SQL: %j", async (column) => {
  const { lease } = await prepare();
  const query = vi.spyOn(db, "transaction");
  const value = extendedResult(evidence());
  await expect(
    store.complete(lease, { ...value, column: { ...value.column, ...column } }),
  ).rejects.toThrow("invalid_snapshot");
  expect(query).not.toHaveBeenCalled();
  query.mockRestore();
});

it("accepts a valid extended result through the same scoped raw UPDATE", async () => {
  const { run } = await prepare();
  const value = extendedResult(evidence());
  await db.query(
    `UPDATE model_playground_columns SET state='completed',result=$1::jsonb,"finishedAt"=CURRENT_TIMESTAMP WHERE "runId"=$2`,
    [JSON.stringify(value), run.id],
  );
  expect((await store.read("project-a", run.id)).columns[0].result).toEqual(value);
});
