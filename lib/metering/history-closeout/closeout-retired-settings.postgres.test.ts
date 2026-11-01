import { reconciliationHealth } from "@/lib/provider-usage/reconcile-state";
import { afterAll, beforeAll, expect, it } from "vitest";
import { gateLimits } from "./live.test-fixture";
import { closeoutManifest, closeoutPolicy, retiredSettingsCloseoutPolicy } from "./manifest";
import { closeoutPostgresFixture } from "./postgres.test-fixture";

let f: Awaited<ReturnType<typeof closeoutPostgresFixture>>;
beforeAll(async () => {
  f = await closeoutPostgresFixture({ live: true });
}, 60000);
afterAll(async () => {
  if (f) await f.close();
});

it("closes a deleted project with retained configuration atomically and replays without another receipt", async () => {
  const { projectPublicId: _, ...base } = await f.manifest("retiredsnap", ["a"], {
    policy: closeoutPolicy,
    connection: "live-retiredsnap",
  });
  const manifest = closeoutManifest.parse({
    ...base,
    retiredProjectId: "retiredsnap",
    policy: retiredSettingsCloseoutPolicy,
  });
  await expect(f.preview(manifest)).rejects.toThrow("must no longer exist");
  await f.client.query("DELETE FROM projects WHERE id='retiredsnap'");
  const before = await f.db.$transaction((tx) => reconciliationHealth(tx, f.namespace, new Date()));
  const preview = await f.preview(manifest);
  expect(preview).toMatchObject({
    applyReady: true,
    schemaReady: true,
    count: 1,
    totalCostUsdUnits: "12345",
    providerIdentity: "unknown",
    nativeUnits: null,
  });
  expect(await f.apply(manifest, preview.planHash)).toMatchObject({ closed: 1, replayed: false });
  expect(await f.apply(manifest, preview.planHash)).toMatchObject({ closed: 1, replayed: true });
  const after = await f.db.$transaction((tx) => reconciliationHealth(tx, f.namespace, new Date()));
  expect(after.unconfirmed).toBe(before.unconfirmed - 1);
  const stored = (
    await f.client.query(
      `SELECT o.state,o.version,count(r.*) AS receipts FROM metering_operation o JOIN metering_receipt r USING(operation_pk) WHERE o.operation_id='legacy:retiredsnap-a' GROUP BY o.operation_pk`,
    )
  ).rows[0];
  expect(stored).toMatchObject({ state: "settled", version: 2, receipts: "2" });
  const audit = (
    await f.client.query(
      `SELECT "projectId",after FROM audit_logs WHERE action='instance_admin.metering_history_closed'`,
    )
  ).rows;
  expect(audit).toHaveLength(1);
  expect(audit[0].projectId).toBeNull();
  expect(audit[0].after).toMatchObject({
    policy: retiredSettingsCloseoutPolicy,
    planHash: preview.planHash,
    retiredProjectId: "retiredsnap",
  });
  expect((await gateLimits(f, "retiredsnap")).group).toBeNull();
}, 60000);
