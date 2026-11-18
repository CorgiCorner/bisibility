import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { invalidProvenance, provenanceResult } from "./attempt-provenance.test-support";
import { columnId } from "./contract-fixtures.test-support";
import {
  createHarness,
  migrations,
  present,
  routingMigration,
} from "./store.postgres.test-support";
import { extendedResult, invalidResultExtensions } from "./store-result.test-support";

const { db, launch, store, evidence } = createHarness(false);

it.each(["extensions", "provenance", "routing"])(
  "preserves previous SQL rejections at %s",
  async (stage) => {
    if (stage !== "extensions")
      await db.exec(
        await readFile(
          new URL(`../../prisma/migrations/${migrations.at(-1)}/migration.sql`, import.meta.url),
          "utf8",
        ),
      );
    if (stage === "routing")
      await db.exec(
        await readFile(
          new URL(`../../prisma/migrations/${routingMigration}/migration.sql`, import.meta.url),
          "utf8",
        ),
      );
    const run = await launch();
    const key = { projectId: "project-a", runId: run.id, columnId };
    const claim = present(await store.claim({ ...key, leaseSeconds: 60 }));
    await store.fenceDispatch({ ...key, leaseToken: present(claim.leaseToken) });
    const base = extendedResult(evidence());
    const costs = present(base.costEvidence);
    const reported = present(costs.providerReported);
    const estimate = present(costs.localEstimate);
    // The previous extension migration's own negative table, plus its runtime slot cases.
    const invalid = [
      ...invalidResultExtensions,
      { answer: "a".repeat(24577) },
      { citations: Array(101).fill(base.citations[0]) },
      { actualProviderId: "bad provider id" },
      { column: { ...base.column, modelId: "different-model" } },
      { costEvidence: { ...costs, providerReported: { ...reported, money: estimate } } },
      {
        costEvidence: {
          ...costs,
          upstreamInference: { total: null, input: estimate, output: null },
        },
      },
      { costEvidence: { ...costs, localEstimate: reported.money } },
      {
        costEvidence: {
          ...costs,
          providerReported: { ...reported, scope: { ...reported.scope, excludes: ["inference"] } },
        },
      },
      {
        costEvidence: {
          ...costs,
          providerReported: { ...reported, scope: { ...reported.scope, kind: "total" } },
        },
      },
    ];
    const update = (value: unknown) =>
      db.query(
        `UPDATE model_playground_columns SET state='completed',result=$1::jsonb,"finishedAt"=CURRENT_TIMESTAMP WHERE "runId"=$2`,
        [JSON.stringify(value), run.id],
      );
    await db.exec("BEGIN");
    try {
      await expect(update(base)).resolves.toMatchObject({ affectedRows: 1 });
    } finally {
      await db.exec("ROLLBACK");
    }
    for (const [index, patch] of invalid.entries()) {
      await db.exec("BEGIN");
      try {
        await expect(update(base)).resolves.toMatchObject({ affectedRows: 1 });
      } finally {
        await db.exec("ROLLBACK");
      }
      await expect(
        update({ ...base, ...patch }),
        `previous rejection ${index}`,
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "model_playground_result_shape",
      });
    }
    if (stage !== "extensions") {
      const provenance = { ...base, ...provenanceResult() };
      for (const patch of invalidProvenance) {
        await db.exec("BEGIN");
        try {
          await expect(update(provenance)).resolves.toMatchObject({ affectedRows: 1 });
        } finally {
          await db.exec("ROLLBACK");
        }
        await expect(update({ ...provenance, ...patch })).rejects.toMatchObject({
          code: "23514",
          constraint: "model_playground_result_shape",
        });
      }
    }
  },
);

it.each([false, true])(
  "migrates existing terminal and claimed rows without rewriting their evidence: extensions=%s",
  async (extensions) => {
    const completed = await launch();
    const claimed = await launch({ ...completed.snapshot, previewId: crypto.randomUUID() });
    const leases = [];
    for (const run of [completed, claimed]) {
      const key = { projectId: "project-a", runId: run.id, columnId };
      const claim = present(await store.claim({ ...key, leaseSeconds: 60 }));
      const lease = { ...key, leaseToken: present(claim.leaseToken) };
      await store.fenceDispatch(lease);
      leases.push(lease);
    }
    const old = extensions ? extendedResult(evidence()) : evidence();
    await store.complete(leases[0], old);
    const before = (
      await db.query(`SELECT result::text FROM model_playground_columns WHERE "runId"=$1`, [
        completed.id,
      ])
    ).rows;
    await db.exec(
      await readFile(
        new URL(`../../prisma/migrations/${migrations.at(-1)}/migration.sql`, import.meta.url),
        "utf8",
      ),
    );
    expect((await store.read("project-a", completed.id)).columns[0].result).toEqual(old);
    expect(
      (
        await db.query(`SELECT result::text FROM model_playground_columns WHERE "runId"=$1`, [
          completed.id,
        ])
      ).rows,
    ).toEqual(before);
    // A real allowed update on the old terminal row still passes the replaced constraint.
    await db.query(
      `UPDATE model_playground_columns SET "liveConnectionId"=NULL,"liveConnectionProjectId"=NULL WHERE "runId"=$1`,
      [completed.id],
    );
    expect((await store.read("project-a", completed.id)).columns[0].result).toEqual(old);
    await store.complete(leases[1], old);
    expect((await store.read("project-a", claimed.id)).columns[0].result).toEqual(old);
  },
);
