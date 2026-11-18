import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { createHarness, migrations, present } from "./store.postgres.test-support";

const { db, launch, store, evidence } = createHarness();

it("rejects non-native preview snapshots even through direct SQL", async () => {
  const run = await launch();
  const value = structuredClone(run.snapshot);
  value.previewId = crypto.randomUUID();
  const column = value.input.columns[0] as unknown as Record<string, unknown>;
  column.providerId = "dataforseo";
  await expect(
    db.query(
      `INSERT INTO model_playground_previews(id,"projectId","actorId",snapshot,"configHash","expiresAt","createdAt")
    VALUES($1,'project-a','actor-a',$2::jsonb,$3,$4::timestamptz AT TIME ZONE 'UTC',$5::timestamptz AT TIME ZONE 'UTC')`,
      [value.previewId, JSON.stringify(value), value.configHash, value.expiresAt, value.createdAt],
    ),
  ).rejects.toThrow();
});

it("retains real project foreign keys independently of the JSON/identity triggers", async () => {
  const run = await launch();
  await db.exec(`ALTER TABLE model_playground_columns DISABLE TRIGGER USER`);
  const config = {
    ...run.snapshot.input.columns[0],
    connectionId: "conn_bbbbbbbbbbbbbbbbbbbbbbbb",
    columnId: crypto.randomUUID(),
  };
  await expect(
    db.query(
      `INSERT INTO model_playground_columns(id,"projectId","runId","columnId","connectionId","providerId",config,"operationKey","liveConnectionId","liveConnectionProjectId")
    VALUES('foreign-connection','project-a',$1,$2,$3,$4,$5::jsonb,'foreign-connection','cmr00000000000000000000002','project-a')`,
      [run.id, config.columnId, config.connectionId, config.providerId, JSON.stringify(config)],
    ),
  ).rejects.toMatchObject({ code: "23503" });
  await expect(
    db.query(
      `INSERT INTO model_playground_columns(id,"projectId","runId","columnId","connectionId","providerId",config,"operationKey","liveConnectionId","liveConnectionProjectId")
    VALUES('foreign-run','project-b',$1,$2,$3,$4,$5::jsonb,'foreign-run','cmr00000000000000000000002','project-b')`,
      [run.id, config.columnId, config.connectionId, config.providerId, JSON.stringify(config)],
    ),
  ).rejects.toMatchObject({ code: "23503" });
});

it("cascades project deletion with attached reports, connections and presets", async () => {
  const run = await launch();
  await store.attachReport("project-a", run.id, "report-a");
  await store.saveManualPreset({ projectId: "project-a", runId: run.id, promptId: "prompt-a" });
  await db.query(`DELETE FROM projects WHERE id='project-a'`);
  for (const table of [
    "model_playground_previews",
    "model_playground_runs",
    "model_playground_columns",
    "model_playground_presets",
  ])
    expect((await db.query(`SELECT id FROM ${table}`)).rows).toEqual([]);
  expect((await db.query(`SELECT id FROM projects`)).rows).toEqual([{ id: "project-b" }]);
});

it("keeps enum addition separate, all SQL additive and free of private storage", async () => {
  const sql = await Promise.all(
    migrations.map((migration) =>
      readFile(
        new URL(`../../prisma/migrations/${migration}/migration.sql`, import.meta.url),
        "utf8",
      ),
    ),
  );
  expect(sql[0]).toContain(`ALTER TYPE "ProviderKind" ADD VALUE 'model'`);
  expect(sql[0]).not.toMatch(/CREATE TABLE/);
  expect(sql.join("\n")).not.toMatch(
    /DROP (?!CONSTRAINT model_playground_result_shape,\s*ADD CONSTRAINT model_playground_result_shape CHECK)|TRUNCATE |DELETE FROM|billing_|credit_|wallet|hosted_pricing/i,
  );
  expect(sql.at(-1)?.match(/DROP CONSTRAINT/g)).toHaveLength(1);
  expect(
    (await db.query(`SELECT 'model_playground'::"ProviderCostFeature" AS feature`)).rows,
  ).toEqual([{ feature: "model_playground" }]);
});

it("enforces immutable previews, runs, columns, report binding and manual-only presets in SQL", async () => {
  const run = await launch();
  for (const sql of [
    `UPDATE model_playground_previews SET "expiresAt"="expiresAt"+INTERVAL '1 day'`,
    `UPDATE model_playground_previews SET snapshot='{}'`,
    `UPDATE model_playground_runs SET "requestId"='replacement'`,
    `UPDATE model_playground_runs SET "actorId"='replacement'`,
    `UPDATE model_playground_runs SET "configHash"='replacement'`,
    `UPDATE model_playground_columns SET "operationKey"='replacement'`,
    `UPDATE model_playground_columns SET config=jsonb_set(config,'{modelId}','"other"')`,
  ])
    await expect(db.query(sql)).rejects.toThrow(/immutable/);
  await store.attachReport("project-a", run.id, "report-a");
  await expect(db.query(`UPDATE model_playground_runs SET "reportId"='report-a2'`)).rejects.toThrow(
    /immutable/,
  );
  await expect(db.query(`UPDATE model_playground_runs SET "reportId"=NULL`)).rejects.toThrow(
    /immutable/,
  );
  await store.saveManualPreset({ projectId: "project-a", runId: run.id, promptId: "prompt-a" });
  await expect(
    db.query(`UPDATE model_playground_presets SET "scheduleEnabled"=true`),
  ).rejects.toThrow();
  await expect(db.query(`UPDATE model_playground_presets SET mode='daily'`)).rejects.toThrow();
});

it("enforces request and column identity and project foreign keys without the store", async () => {
  const run = await launch();
  await expect(
    db.query(
      `INSERT INTO model_playground_runs SELECT 'duplicate',"projectId","actorId","requestId","previewId","configHash",snapshot,NULL,"createdAt" FROM model_playground_runs`,
    ),
  ).rejects.toThrow(/unique/);
  await expect(
    db.query(
      `INSERT INTO model_playground_runs SELECT 'cross','project-b',"actorId","requestId","previewId","configHash",snapshot,NULL,"createdAt" FROM model_playground_runs`,
    ),
  ).rejects.toThrow();
  await expect(
    db.query(
      `INSERT INTO model_playground_columns SELECT 'duplicate',"projectId","runId","columnId","connectionId","liveConnectionId","liveConnectionProjectId","providerId",config,'different-operation',state,NULL,NULL,NULL,NULL,NULL FROM model_playground_columns`,
    ),
  ).rejects.toThrow(/unique/);
  await expect(
    db.query(
      `INSERT INTO model_playground_columns SELECT 'cross','project-b',"runId","columnId",'conn_bbbbbbbbbbbbbbbbbbbbbbbb',"liveConnectionId","liveConnectionProjectId","providerId",config,'different-operation',state,NULL,NULL,NULL,NULL,NULL FROM model_playground_columns`,
    ),
  ).rejects.toThrow();
  await expect(
    db.query(
      `INSERT INTO model_playground_presets(id,"projectId","runId","promptId",config) VALUES('cross','project-a',$1,'prompt-b',$2)`,
      [run.id, JSON.stringify(run.snapshot.input)],
    ),
  ).rejects.toThrow(/foreign key/);
  await expect(db.query(`UPDATE model_playground_runs SET "reportId"='report-b'`)).rejects.toThrow(
    /foreign key/,
  );
});

it("rejects excluded provider, secret config and oversized/invalid evidence in SQL", async () => {
  const run = await launch();
  const column = run.snapshot.input.columns[0];
  const bad = {
    ...column,
    columnId: crypto.randomUUID(),
    providerId: "dataforseo",
    apiKey: "secret-canary",
  };
  await expect(
    db.query(
      `INSERT INTO model_playground_columns(id,"projectId","runId","columnId","connectionId","providerId",config,"operationKey") VALUES('bad','project-a',$1,$2,$3,$4,$5::jsonb,'bad-operation')`,
      [run.id, bad.columnId, column.connectionId, bad.providerId, JSON.stringify(bad)],
    ),
  ).rejects.toThrow();
  const claim = present(
    await store.claim({
      projectId: "project-a",
      runId: run.id,
      columnId: column.columnId,
      leaseSeconds: 60,
    }),
  );
  await store.fenceDispatch({
    projectId: "project-a",
    runId: run.id,
    columnId: column.columnId,
    leaseToken: present(claim.leaseToken),
  });
  for (const invalid of [
    { ...evidence(), answer: "x".repeat(24577) },
    { ...evidence(), actualProviderId: undefined },
    { ...evidence(), usage: { ...evidence().usage, apiKey: "secret-canary" } },
  ])
    await expect(
      db.query(
        `UPDATE model_playground_columns SET state='completed',result=$1::jsonb,"finishedAt"=CURRENT_TIMESTAMP`,
        [JSON.stringify(invalid)],
      ),
    ).rejects.toThrow();
  await store.complete(
    {
      projectId: "project-a",
      runId: run.id,
      columnId: column.columnId,
      leaseToken: present(claim.leaseToken),
    },
    evidence(),
  );
  await expect(
    db.query(`UPDATE model_playground_columns SET state='queued',result=NULL,"finishedAt"=NULL`),
  ).rejects.toThrow();
});

it("permits only a pure one-way live detach while keeping project and snapshot identity immutable", async () => {
  await launch();
  for (const sql of [
    `UPDATE model_playground_columns SET "liveConnectionId"='cmr00000000000000000000003'`,
    `UPDATE model_playground_columns SET "liveConnectionId"=NULL`,
    `UPDATE model_playground_columns SET "liveConnectionId"=NULL,"liveConnectionProjectId"=NULL,"operationKey"='replacement'`,
    `UPDATE model_playground_columns SET "liveConnectionId"=NULL,"liveConnectionProjectId"=NULL,"projectId"='project-b'`,
  ])
    await expect(db.query(sql)).rejects.toThrow(/immutable/);
  await db.query(
    `UPDATE model_playground_columns SET "liveConnectionId"=NULL,"liveConnectionProjectId"=NULL`,
  );
  await expect(
    db.query(
      `UPDATE model_playground_columns SET "liveConnectionId"='cmr00000000000000000000001',"liveConnectionProjectId"='project-a'`,
    ),
  ).rejects.toThrow(/immutable/);
});

it.each([
  `"credentialSource"='hosted'`,
  `provider='other-native-provider'`,
  `kind='analytics'`,
  `"publicId"='conn_eeeeeeeeeeeeeeeeeeeeeeee'`,
])("refuses a changed live connection at claim and dispatch: %s", async (change) => {
  const run = await launch();
  const key = { projectId: "project-a", runId: run.id, columnId: run.columns[0].columnId };
  const claim = present(await store.claim({ ...key, leaseSeconds: 60 }));
  await db.query(`UPDATE provider_connections SET ${change} WHERE id='cmr00000000000000000000001'`);
  await db.query(
    `UPDATE model_playground_columns SET "leaseExpiresAt"=CURRENT_TIMESTAMP-INTERVAL '1 second'`,
  );
  expect(await store.claim({ ...key, leaseSeconds: 60 })).toBeNull();
  // Restore only the lease time so connection custody is the dispatch refusal reason.
  await db.query(
    `UPDATE model_playground_columns SET "leaseExpiresAt"=CURRENT_TIMESTAMP+INTERVAL '1 minute'`,
  );
  await expect(store.fenceDispatch({ ...key, leaseToken: claim.leaseToken })).rejects.toThrow(
    "stale_lease",
  );
  await expect(
    db.query(`UPDATE model_playground_columns SET "dispatchStartedAt"=CURRENT_TIMESTAMP`),
  ).rejects.toThrow(/fenced/);
});

it("accepts explicit platform preview identity without letting own-key rows borrow it", async () => {
  const run = await launch();
  const input = structuredClone(run.snapshot.input);
  const column = input.columns[0];
  column.connectionId = "platform:openrouter";
  column.payment = { optionId: column.connectionId, fundingSource: "platform" };
  const valid = async (value: unknown = input) =>
    (
      await db.query<{ valid: boolean }>(
        "SELECT model_playground_native_input($1::jsonb) AS valid",
        [JSON.stringify(value)],
      )
    ).rows[0].valid;
  expect(await valid()).toBe(true);
  column.payment.fundingSource = "byok";
  expect(await valid()).toBe(false);
  column.payment.fundingSource = "platform";
  column.payment.optionId = "platform:anthropic";
  expect(await valid()).toBe(false);
  column.payment.optionId = column.connectionId;
  expect(
    await valid({
      ...input,
      columns: [
        {
          ...column,
          providerId: "vercel_ai_gateway",
          connectionId: "platform:vercel_ai_gateway",
          payment: { fundingSource: "platform", optionId: "platform:vercel_ai_gateway" },
        },
      ],
    }),
  ).toBe(false);
});
