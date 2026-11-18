import { expect, it } from "vitest";
import { columnId, connectionId } from "./contract-fixtures.test-support";
import { createHarness, internalConnectionId, present } from "./store.postgres.test-support";

const { db, store, snapshot, launch, evidence } = createHarness();

it("launches once per matching request and rejects a changed hash, actor, preview or project", async () => {
  const value = snapshot();
  await store.savePreview(value, "actor-a");
  const request = {
    version: 1 as const,
    projectId: "project-a",
    actorId: "actor-a",
    requestId: crypto.randomUUID(),
    previewId: value.previewId,
    configHash: value.configHash,
  };
  const [a, b] = await Promise.all([store.launch(request), store.launch(request)]);
  expect(a.id).toBe(b.id);
  expect(a.columns).toHaveLength(1);
  for (const change of [
    { configHash: "b".repeat(64) },
    { actorId: "other" },
    { previewId: crypto.randomUUID() },
    { projectId: "project-b" },
  ])
    await expect(store.launch({ ...request, ...change })).rejects.toThrow();
  await expect(store.read("project-b", a.id)).rejects.toThrow("not_found");
});

it("resolves a public native own-key connection without changing retained config identity", async () => {
  expect(internalConnectionId).not.toBe(connectionId);
  const run = await launch();
  expect(run.snapshot.input.columns[0].connectionId).toBe(connectionId);
  expect(run.columns[0].config.connectionId).toBe(connectionId);
  expect((await store.read("project-a", run.id)).columns[0].config.connectionId).toBe(connectionId);
  expect(
    (
      await db.query(
        `SELECT "connectionId","liveConnectionId","liveConnectionProjectId" FROM model_playground_columns`,
      )
    ).rows,
  ).toEqual([
    { connectionId, liveConnectionId: internalConnectionId, liveConnectionProjectId: "project-a" },
  ]);
});

it.each([
  ["foreign project", "conn_bbbbbbbbbbbbbbbbbbbbbbbb", "openrouter"],
  ["provider mismatch", "conn_cccccccccccccccccccccccc", "openrouter"],
  ["hosted source", "conn_dddddddddddddddddddddddd", "anthropic"],
] as const)("rolls back a launch with %s connection scope", async (_reason, id, providerId) => {
  const value = snapshot();
  value.input.columns[0] = { ...value.input.columns[0], connectionId: id, providerId };
  await expect(launch(value)).rejects.toThrow();
  expect((await db.query(`SELECT id FROM model_playground_runs`)).rows).toEqual([]);
  expect((await db.query(`SELECT id FROM model_playground_columns`)).rows).toEqual([]);
});

it("rolls back valid sibling columns when a later connection is invalid", async () => {
  const value = snapshot();
  const secondId = crypto.randomUUID();
  value.input.columns.push({
    ...value.input.columns[0],
    columnId: secondId,
    providerId: "anthropic",
    connectionId: "conn_dddddddddddddddddddddddd",
  });
  value.columns.push({ ...value.columns[0], columnId: secondId });
  await expect(launch(value)).rejects.toThrow();
  expect((await db.query(`SELECT id FROM model_playground_runs`)).rows).toEqual([]);
  expect((await db.query(`SELECT id FROM model_playground_columns`)).rows).toEqual([]);
});

it("has one independent claim winner and rejects stale lease, wrong-project and duplicate completion", async () => {
  const run = await launch();
  const key = { projectId: "project-a", runId: run.id, columnId };
  const claims = await Promise.all([
    store.claim({ ...key, leaseSeconds: 60 }),
    store.claim({ ...key, leaseSeconds: 60 }),
  ]);
  expect(claims.filter(Boolean)).toHaveLength(1);
  const claim = present(claims.find(Boolean));
  const lease = { ...key, leaseToken: present(claim.leaseToken) };
  await expect(
    store.complete({ ...lease, leaseToken: crypto.randomUUID() }, evidence()),
  ).rejects.toThrow("stale_lease");
  await expect(store.fenceDispatch({ ...lease, projectId: "project-b" })).rejects.toThrow(
    "stale_lease",
  );
  await store.fenceDispatch(lease);
  await expect(store.fenceDispatch(lease)).rejects.toThrow("stale_lease");
  await expect(
    store.complete({ ...lease, leaseToken: crypto.randomUUID() }, evidence()),
  ).rejects.toThrow("stale_lease");
  await expect(store.complete({ ...lease, projectId: "project-b" }, evidence())).rejects.toThrow(
    "not_found",
  );
  await store.complete(lease, evidence());
  await expect(store.complete(lease, evidence())).rejects.toThrow("stale_lease");
  const saved = present((await store.read("project-a", run.id)).columns[0].result);
  expect(saved.actualProviderId).toBe("upstream/vendor");
  expect(saved.citations).toHaveLength(2);
  expect(saved.usage.completeness).toBe("unknown");
  expect(saved.column.connectionId).toBe(connectionId);
});

it("recovers expired undispatched claims but preserves dispatched uncertainty without paid replay", async () => {
  const run = await launch();
  const key = { projectId: "project-a", runId: run.id, columnId };
  const first = present(await store.claim({ ...key, leaseSeconds: 60 }));
  await db.query(
    `UPDATE model_playground_columns SET "leaseExpiresAt"=CURRENT_TIMESTAMP-INTERVAL '1 second'`,
  );
  const second = present(await store.claim({ ...key, leaseSeconds: 60 }));
  expect(second.leaseToken).not.toBe(first.leaseToken);
  expect(second.operationKey).toBe(first.operationKey);
  await expect(store.fenceDispatch({ ...key, leaseToken: first.leaseToken })).rejects.toThrow(
    "stale_lease",
  );
  const lease = { ...key, leaseToken: present(second.leaseToken) };
  await store.fenceDispatch(lease);
  await db.query(
    `UPDATE model_playground_columns SET "leaseExpiresAt"=CURRENT_TIMESTAMP-INTERVAL '1 second'`,
  );
  await expect(store.complete(lease, evidence())).rejects.toThrow("stale_lease");
  expect(await store.claim({ ...key, leaseSeconds: 60 })).toBeNull();
  expect(await store.expireDispatched({ ...lease, leaseToken: first.leaseToken })).toBe(false);
  expect(await store.expireDispatched(lease)).toBe(true);
  expect(await store.claim({ ...key, leaseSeconds: 60 })).toBeNull();
  const retained = (await store.read("project-a", run.id)).columns[0];
  expect(retained).toMatchObject({
    state: "unknown",
    result: null,
    operationKey: first.operationKey,
    leaseToken: second.leaseToken,
  });
  expect(retained.dispatchStartedAt).not.toBeNull();
});

it("binds at most one project-owned report and saves an exact manual preset without schedules", async () => {
  const run = await launch();
  await expect(store.attachReport("project-a", run.id, "report-b")).rejects.toThrow();
  await store.attachReport("project-a", run.id, "report-a");
  await store.attachReport("project-a", run.id, "report-a");
  await expect(store.attachReport("project-a", run.id, "report-a2")).rejects.toThrow();
  await expect(
    store.saveManualPreset({ projectId: "project-a", runId: run.id, promptId: "prompt-b" }),
  ).rejects.toThrow();
  const input = { projectId: "project-a", runId: run.id, promptId: "prompt-a" };
  expect(await store.saveManualPreset(input)).toBe(await store.saveManualPreset(input));
  const preset = (
    await db.query(`SELECT config,mode,"scheduleEnabled" FROM model_playground_presets`)
  ).rows[0];
  expect(preset).toEqual({ config: run.snapshot.input, mode: "manual", scheduleEnabled: false });
  expect((await db.query(`SELECT * FROM keyword_schedules`)).rows).toEqual([
    { id: "existing-schedule", enabled: true },
  ]);
  expect((await db.query(`SELECT * FROM rank_checks`)).rows).toEqual([{ id: "existing-history" }]);
});

it("rejects invalid or secret fields at writes and validates stored data on reads", async () => {
  await expect(
    store.savePreview({ ...snapshot(), apiKey: "secret-canary" }, "actor-a"),
  ).rejects.toThrow("invalid_snapshot");
  const value = snapshot();
  value.input.columns[0].settings.maxOutputTokens = 9000;
  await expect(store.savePreview(value, "actor-a")).rejects.toThrow("invalid_snapshot");
  const run = await launch();
  const key = { projectId: "project-a", runId: run.id, columnId };
  const claimed = present(await store.claim({ ...key, leaseSeconds: 60 }));
  const lease = { ...key, leaseToken: present(claimed.leaseToken) };
  await store.fenceDispatch(lease);
  for (const invalid of [
    { ...evidence(), headers: { Authorization: "secret-canary" } },
    { ...evidence(), answer: "x".repeat(24577) },
    { ...evidence(), actualProviderId: undefined },
  ])
    await expect(store.complete(lease, invalid)).rejects.toThrow("invalid_snapshot");
  const wrong = evidence();
  wrong.column = { ...wrong.column, modelId: "other/model" };
  await expect(store.complete(lease, wrong)).rejects.toThrow("conflict");
  // Simulate legacy/corrupt storage below the SQL guard, then exercise the real reader.
  await db.exec(`ALTER TABLE model_playground_runs DISABLE TRIGGER USER`);
  await db.query(
    `UPDATE model_playground_runs SET snapshot=jsonb_set(snapshot,'{apiKey}','"secret-canary"')`,
  );
  await expect(store.read("project-a", run.id)).rejects.toThrow("invalid_snapshot");
});

it("keeps duplicate models independent by column and allows the same column IDs in another run", async () => {
  const value = snapshot();
  const secondId = crypto.randomUUID();
  value.input.columns.push({ ...value.input.columns[0], columnId: secondId });
  value.columns.push({ ...value.columns[0], columnId: secondId });
  const run = await launch(value);
  const claims = await Promise.all(
    [columnId, secondId].map((id) =>
      store.claim({
        projectId: "project-a",
        runId: run.id,
        columnId: id,
        leaseSeconds: 60,
      }),
    ),
  );
  expect(claims.every(Boolean)).toBe(true);
  expect(new Set(claims.map((claim) => claim?.operationKey)).size).toBe(2);
  const other = await launch({ ...value, previewId: crypto.randomUUID() });
  expect(other.columns.map((column) => column.columnId)).toEqual([columnId, secondId]);
  expect(other.columns.every((column) => column.state === "queued")).toBe(true);
  await store.attachReport("project-a", run.id, "report-a");
  await expect(store.attachReport("project-a", other.id, "report-a")).rejects.toThrow();
});

it("rejects expired previews but returns an already committed matching request after expiry", async () => {
  const value = snapshot();
  value.createdAt = new Date(Date.now() - 120_000).toISOString();
  value.expiresAt = new Date(Date.now() - 60_000).toISOString();
  await expect(launch(value)).rejects.toThrow("not_found");
  const valid = snapshot();
  valid.previewId = crypto.randomUUID();
  await store.savePreview(valid, "actor-a");
  const request = {
    version: 1,
    projectId: "project-a",
    actorId: "actor-a",
    requestId: crypto.randomUUID(),
    previewId: valid.previewId,
    configHash: valid.configHash,
  };
  const run = await store.launch(request);
  await db.exec(`ALTER TABLE model_playground_previews DISABLE TRIGGER USER`);
  await db.query(
    `UPDATE model_playground_previews SET "expiresAt"=CURRENT_TIMESTAMP-INTERVAL '1 second',"createdAt"=CURRENT_TIMESTAMP-INTERVAL '2 seconds' WHERE id=$1`,
    [valid.previewId],
  );
  expect((await store.launch(request)).id).toBe(run.id);
});

it("validates retained column evidence on read and suppresses database error contents", async () => {
  const run = await launch();
  const key = { projectId: "project-a", runId: run.id, columnId };
  const claim = present(await store.claim({ ...key, leaseSeconds: 60 }));
  const lease = { ...key, leaseToken: present(claim.leaseToken) };
  await store.fenceDispatch(lease);
  await store.complete(lease, evidence());
  await db.exec(`ALTER TABLE model_playground_columns DISABLE TRIGGER USER;
    ALTER TABLE model_playground_columns DROP CONSTRAINT model_playground_result_shape`);
  await db.query(`UPDATE model_playground_columns SET result=result-'actualProviderId'`);
  await expect(store.read("project-a", run.id)).rejects.toThrow("invalid_snapshot");
  await db.exec(
    `ALTER TABLE model_playground_columns DROP CONSTRAINT model_playground_column_state`,
  );
  await db.query(`UPDATE model_playground_columns SET result=NULL`);
  await expect(store.read("project-a", run.id)).rejects.toThrow("invalid_snapshot");
  try {
    await store.savePreview(
      { ...snapshot(), previewId: crypto.randomUUID(), projectId: "secret-canary" },
      "actor-a",
    );
    throw new Error("Expected storage refusal");
  } catch (error) {
    expect(String(error)).toBe("Error: Model Playground storage: storage.");
    expect(JSON.stringify(error)).not.toContain("secret-canary");
    expect(error).not.toHaveProperty("cause");
  }
});
