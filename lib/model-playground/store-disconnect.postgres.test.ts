import { disconnectProviderConnection } from "@/lib/api/provider-disconnect";
import type { DisconnectProviderInput } from "@/lib/schemas/provider";
import { beforeEach, expect, it, vi } from "vitest";
import { columnId, connectionId } from "./contract-fixtures.test-support";
import { createHarness, internalConnectionId, present } from "./store.postgres.test-support";

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.audit }));
// P03 owns registration. Only this fixture exposes the native provider to the existing service.
vi.mock("@/lib/providers/registry", () => ({ PROVIDER_CATALOG: [{ id: "openrouter" }] }));

const { db, store, snapshot, launch, evidence } = createHarness();

beforeEach(() => {
  mocks.audit.mockReset();
  // Adapt only the Prisma transport; disconnect, project/funding locks and DELETE execute for real.
  mocks.transaction.mockImplementation((work) =>
    db.transaction((tx) =>
      work({
        $queryRaw: async (parts: TemplateStringsArray, ...args: unknown[]) =>
          (
            await tx.query(
              parts.reduce((sql, part, i) => sql + (i ? `$${i}` : "") + part, ""),
              args,
            )
          ).rows,
        providerConnection: {
          findUnique: async ({
            where,
          }: {
            where: { id?: string; projectId_provider?: { projectId: string; provider: string } };
          }) => {
            const pair = where.projectId_provider;
            const rows = pair
              ? await tx.query(
                  `SELECT * FROM provider_connections WHERE "projectId"=$1 AND provider=$2`,
                  [pair.projectId, pair.provider],
                )
              : await tx.query(`SELECT * FROM provider_connections WHERE id=$1`, [where.id]);
            return rows.rows[0] ?? null;
          },
          delete: async ({ where }: { where: { id: string } }) =>
            (await tx.query(`DELETE FROM provider_connections WHERE id=$1 RETURNING *`, [where.id]))
              .rows[0],
        },
      }),
    ),
  );
});

async function disconnect() {
  // The generic service already accepts catalog IDs; its public input enum is P03 scope.
  const input = {
    projectId: "prj_aaaaaaaaaaaaaaaaaaaaaaaa",
    providerId: "openrouter",
  } as unknown as DisconnectProviderInput;
  await expect(
    disconnectProviderConnection(input, { projectId: "project-a", actorId: "actor-a" }),
  ).resolves.toEqual({ ok: true });
  expect(
    (await db.query(`SELECT id FROM provider_connections WHERE id=$1`, [internalConnectionId]))
      .rows,
  ).toEqual([]);
  expect(mocks.audit).toHaveBeenCalledWith(
    expect.objectContaining({ action: "provider.disconnect", targetId: connectionId }),
    expect.anything(),
  );
}

async function nextRun() {
  return launch({ ...snapshot(), previewId: crypto.randomUUID() });
}
async function lease(runId: string, id = columnId) {
  const key = { projectId: "project-a", runId, columnId: id };
  const claim = present(await store.claim({ ...key, leaseSeconds: 60 }));
  return { ...key, leaseToken: present(claim.leaseToken) };
}

it("normal disconnect deletes the key while completed, unknown and in-flight evidence survive", async () => {
  const completed = await nextRun();
  const completedLease = await lease(completed.id);
  await store.fenceDispatch(completedLease);
  await store.complete(completedLease, evidence());
  await store.attachReport("project-a", completed.id, "report-a");
  await store.saveManualPreset({
    projectId: "project-a",
    runId: completed.id,
    promptId: "prompt-a",
  });
  const unknown = await nextRun();
  const unknownLease = await lease(unknown.id);
  await store.fenceDispatch(unknownLease);
  await store.complete(unknownLease, {
    ...evidence(),
    state: "unknown",
    failure: "accounting_unknown",
  });
  const inFlight = await nextRun();
  const inFlightLease = await lease(inFlight.id);
  await store.fenceDispatch(inFlightLease);
  const retained = await Promise.all(
    [completed, unknown, inFlight].map((run) => store.read("project-a", run.id)),
  );

  await disconnect();

  for (let i = 0; i < retained.length; i++) {
    const after = await store.read("project-a", retained[i].id);
    expect(after).toEqual({
      ...retained[i],
      columns: retained[i].columns.map((column) => ({
        ...column,
        liveConnectionId: null,
        liveConnectionProjectId: null,
      })),
    });
    expect(after.columns[0].config.connectionId).toBe(connectionId);
  }
  expect((await db.query(`SELECT config FROM model_playground_presets`)).rows).toEqual([
    { config: completed.snapshot.input },
  ]);
  // Original response persistence remains possible after key removal, without reacquiring dispatch.
  await store.complete(inFlightLease, evidence());
  expect((await store.read("project-a", inFlight.id)).columns[0].state).toBe("completed");
  await expect(
    db.query(`UPDATE model_playground_columns SET result=NULL WHERE "runId"=$1`, [completed.id]),
  ).rejects.toThrow(/immutable/);
  await db.query(`DELETE FROM projects WHERE id='project-a'`);
  for (const table of [
    "model_playground_previews",
    "model_playground_runs",
    "model_playground_columns",
    "model_playground_presets",
  ])
    expect((await db.query(`SELECT id FROM ${table}`)).rows).toEqual([]);
});

it("never grants queued, claimed or expired undispatched work permission after disconnect or replacement", async () => {
  const value = snapshot();
  const claimedId = crypto.randomUUID();
  const expiredId = crypto.randomUUID();
  for (const id of [claimedId, expiredId]) {
    value.input.columns.push({ ...value.input.columns[0], columnId: id });
    value.columns.push({ ...value.columns[0], columnId: id });
  }
  const run = await launch(value);
  const claimedLease = await lease(run.id, claimedId);
  const expiredLease = await lease(run.id, expiredId);
  await db.query(
    `UPDATE model_playground_columns SET "leaseExpiresAt"=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE "columnId"=$1`,
    [expiredId],
  );
  await disconnect();
  for (const replacement of [false, true]) {
    if (replacement)
      await db.query(
        `INSERT INTO provider_connections(id,"publicId","projectId",provider,kind,"credentialSource","credentialsEncrypted") VALUES('cmr00000000000000000000009',$1,'project-a','openrouter','model','own','replacement-fixture-key')`,
        [connectionId],
      );
    for (const id of [columnId, claimedId, expiredId])
      expect(
        await store.claim({
          projectId: "project-a",
          runId: run.id,
          columnId: id,
          leaseSeconds: 60,
        }),
      ).toBeNull();
    for (const oldLease of [claimedLease, expiredLease])
      await expect(store.fenceDispatch(oldLease)).rejects.toThrow("stale_lease");
    await expect(
      db.query(
        `UPDATE model_playground_columns SET "dispatchStartedAt"=CURRENT_TIMESTAMP WHERE "columnId"=$1`,
        [claimedId],
      ),
    ).rejects.toThrow(/fenced/);
    await expect(
      db.query(
        `UPDATE model_playground_columns SET state='claimed',"leaseToken"=$1,"leaseExpiresAt"=CURRENT_TIMESTAMP+INTERVAL '1 minute' WHERE "columnId"=$2`,
        [crypto.randomUUID(), columnId],
      ),
    ).rejects.toThrow(/fenced/);
  }
  await expect(
    db.query(
      `UPDATE model_playground_columns SET "liveConnectionId"='cmr00000000000000000000009',"liveConnectionProjectId"='project-a'`,
    ),
  ).rejects.toThrow(/immutable/);
  // New work may bind the new row; old work remains detached even with a reused public ID.
  const fresh = await nextRun();
  await store.fenceDispatch(await lease(fresh.id));
  expect(
    (await store.read("project-a", run.id)).columns.every(
      (column) => column.dispatchStartedAt === null,
    ),
  ).toBe(true);
});

it("can close an expired dispatched column as unknown after disconnect without replay", async () => {
  const run = await nextRun();
  const original = await lease(run.id);
  await store.fenceDispatch(original);
  await disconnect();
  await db.query(
    `UPDATE model_playground_columns SET "leaseExpiresAt"=CURRENT_TIMESTAMP-INTERVAL '1 second'`,
  );
  expect(await store.expireDispatched(original)).toBe(true);
  const saved = (await store.read("project-a", run.id)).columns[0];
  expect(saved).toMatchObject({
    state: "unknown",
    leaseToken: original.leaseToken,
    result: null,
    liveConnectionId: null,
  });
  expect(saved.dispatchStartedAt).not.toBeNull();
  expect(
    await store.claim({ projectId: "project-a", runId: run.id, columnId, leaseSeconds: 60 }),
  ).toBeNull();
});
