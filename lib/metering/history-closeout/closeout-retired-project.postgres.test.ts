import type { PrismaClient } from "@/lib/generated/prisma/client";
import {
  listHistoricalCloseoutCandidates,
  runHistoricalCloseout,
} from "@/scripts/ops/closeout-historical-finances";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { listCloseoutCandidates } from "./list";
import { gateLimits } from "./live.test-fixture";
import { type CloseoutManifest, closeoutPolicy, liveConnectionCloseoutPolicy } from "./manifest";
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

/** v1 manifest for a project whose row was deleted after the original import. */
async function retired(cohort: string, connection: string, retiredProjectId = cohort) {
  const { projectPublicId: _, ...manifest } = await f.manifest(cohort, ["a"], {
    policy: closeoutPolicy,
    connection,
  });
  return { ...manifest, retiredProjectId } as CloseoutManifest;
}
const deleteProject = (id: string) => f.client.query("DELETE FROM projects WHERE id=$1", [id]);

it("closes imports of a deleted project and deleted connection under v1 with a project-free audit", async () => {
  const live = await retired("retiredproj", "retired-retiredproj");
  await expect(f.preview(live)).rejects.toThrow("A retired project must no longer exist.");
  await deleteProject("retiredproj");
  const listed = await f.db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      return listCloseoutCandidates(tx, {
        namespace: f.namespace,
        retiredProjectId: "retiredproj",
        connection: "retired-retiredproj",
      });
    },
    { isolationLevel: "RepeatableRead" },
  );
  expect(listed).toMatchObject({
    policy: closeoutPolicy,
    totalCostUsdUnits: "12345",
    operations: [{ operationId: "legacy:retiredproj-a", expectedVersion: 1 }],
  });
  expect(listed.operations[0]!.receiptId).toBe(live.operations[0]!.receiptId);
  await expect(
    f.preview(await retired("retiredproj", "retired-retiredproj", "otherproject")),
  ).rejects.toThrow("Historical project, connection or namespace mismatch");
  const manifest = await retired("retiredproj", "retired-retiredproj");
  const preview = await f.preview(manifest);
  expect(preview).toMatchObject({ applyReady: true, count: 1, totalCostUsdUnits: "12345" });
  expect(await f.apply(manifest, preview.planHash)).toMatchObject({ closed: 1, replayed: false });
  expect(await f.apply(manifest, preview.planHash)).toMatchObject({ replayed: true });
  const audit = (
    await f.client.query(
      `SELECT "projectId","targetType","targetId",after FROM audit_logs WHERE action='instance_admin.metering_history_closed'`,
    )
  ).rows;
  expect(audit).toEqual([
    expect.objectContaining({
      projectId: null,
      targetType: "instance_ops",
      targetId: "retired-project-closeout",
    }),
  ]);
  expect(audit[0].after).toMatchObject({
    policy: closeoutPolicy,
    planHash: preview.planHash,
    connection: "retired-retiredproj",
    retiredProjectId: "retiredproj",
  });
  expect((await gateLimits(f, "retiredproj")).group).toBeNull();
});

it("refuses a surviving connection, a retained connection snapshot and the live policy", async () => {
  await deleteProject("retiredconn");
  await expect(f.preview(await retired("retiredconn", "live-liveowner"))).rejects.toThrow(
    "Only a retired connection is eligible.",
  );
  await deleteProject("retiredsnap");
  expect(
    (await f.client.query("SELECT count(*) FROM provider_connections WHERE id='live-retiredsnap'"))
      .rows[0].count,
  ).toBe("0");
  await expect(f.preview(await retired("retiredsnap", "live-retiredsnap"))).rejects.toThrow(
    "Active, revised",
  );
  const live = await retired("retiredsnap", "live-retiredsnap");
  await expect(
    f.preview({ ...live, policy: liveConnectionCloseoutPolicy } as CloseoutManifest),
  ).rejects.toThrow("retired-connection policy");
});

it("lists live candidates and previews them through the operator CLI without writes", async () => {
  const before = (
    await f.client.query("SELECT operation_pk,state,version FROM metering_operation ORDER BY 1")
  ).rows;
  const listed = await listHistoricalCloseoutCandidates(
    f.url,
    {
      namespace: f.namespace,
      projectPublicId: f.projects.get("livegate"),
      connection: "live-livegate",
    },
    30000,
  );
  expect(listed).toMatchObject({
    policy: liveConnectionCloseoutPolicy,
    totalCostUsdUnits: "24690",
    nextAfter: null,
    execution: { mode: "read_only_list" },
  });
  expect(listed.operations.map((o) => o.operationId)).toEqual([
    "legacy:livegate-a",
    "legacy:livegate-b",
  ]);
  const manifest = await f.liveManifest("livegate", ["a", "b"]);
  expect(
    listed.operations.map(({ operationId, expectedVersion, receiptId }) => ({
      operationId,
      expectedVersion,
      receiptId,
    })),
  ).toEqual(manifest.operations);
  const preview = await runHistoricalCloseout(f.url, manifest, undefined, 30000);
  expect(preview).toMatchObject({
    policy: liveConnectionCloseoutPolicy,
    applyReady: true,
    count: 2,
    execution: { mode: "read_only_preview" },
  });
  expect(
    (await f.client.query("SELECT operation_pk,state,version FROM metering_operation ORDER BY 1"))
      .rows,
  ).toEqual(before);
});
