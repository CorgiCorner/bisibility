import { dataMigrationManifest } from "@/lib/data-migrations/manifest";
import { makePublicId } from "@/lib/db/public-id";
import { fencePaidAttemptsInTransaction } from "@/lib/metering/paid-dispatch";
import {
  legacyWebPolicy,
  legacyWebPolicyMigration,
} from "@/scripts/data-migrations/20261013000000_legacy_web_policy";
import { resolveActiveDataMigrations } from "@/scripts/data-migrations/resolver";
import { runActiveDataMigrations } from "@/scripts/data-migrations/runner";
import type { DataMigrationDatabase } from "@/scripts/data-migrations/types";
import { expect, it, vi } from "vitest";
import { frozenRequest } from "./canonical";
import { configureHostDefinitionPolicy } from "./host-policy-configuration";
import { readHostPolicySnapshot } from "./host-policy-snapshot";
import { definitionDatabaseFixture } from "./postgres.test-fixture";
import { readDefinitionSource } from "./storage";
import { workerNativeFixture } from "./worker-native.postgres.test-fixture";

const invocation = vi.hoisted(() => ({
  workflowId: "owned-legacy-policy",
  runId: "owned-legacy-policy-run",
}));
vi.mock("server-only", () => ({}));
vi.mock("@temporalio/activity", () => ({
  Context: { current: () => ({ info: { workflowExecution: invocation } }) },
}));

async function migrate(f: Awaited<ReturnType<typeof definitionDatabaseFixture>>) {
  const entry = dataMigrationManifest.find((row) => row.id === legacyWebPolicyMigration.id);
  if (!entry) throw new Error("Registered deploy-blocking legacy policy migration required.");
  const migrations = await resolveActiveDataMigrations([entry], [legacyWebPolicyMigration]);
  const db: DataMigrationDatabase = {
    query: (sql, values) => f.client.query(sql, values ? [...values] : undefined),
  };
  await runActiveDataMigrations(db, migrations, { batchSize: 1, log: () => undefined });
}

it("preserves an existing20-target schedule/history and enables actual manual and scheduled native definition fences without sending", async () => {
  const f = await workerNativeFixture(invocation, { configurePolicy: false });
  try {
    const projectId = f.project.project.id;
    const schedule = await f.db.checkSchedule.create({
      data: {
        projectId,
        publicId: makePublicId("sch"),
        name: "Retained schedule",
        frequency: "daily",
        timezone: "Europe/Warsaw",
        timeOfDay: "06:00",
        serpDepth: 20,
        enabled: true,
      },
    });
    await f.db.keyword.update({
      where: { id: f.observation.keyword.id },
      data: { checkScheduleId: schedule.id },
    });
    await f.db.keyword.createMany({
      data: Array.from({ length: 19 }, (_, index) => ({
        projectId,
        publicId: makePublicId("kw"),
        text: `Retained target ${index}`,
        locationId: f.observation.location.id,
        location: "Synthetic",
        checkScheduleId: schedule.id,
      })),
    });
    const schedules = await f.db.checkSchedule.findMany();
    const keywords = await f.db.keyword.findMany({ orderBy: { id: "asc" } });
    const history = await f.db.rankCheck.findMany();
    const before = await f.db.$transaction((tx) => readHostPolicySnapshot(tx, projectId));
    expect(before.state).toBe("unconfigured");
    const source = await f.db.$transaction((tx) =>
      readDefinitionSource(tx, projectId, f.observation.keyword.id),
    );
    expect(() => frozenRequest(source, "dataforseo", 20)).toThrow();
    expect(await f.db.rankCheckRun.count()).toBe(0);
    await migrate(f);
    const after = await f.db.$transaction((tx) => readHostPolicySnapshot(tx, projectId));
    expect(after).toMatchObject({ state: "ready", config: legacyWebPolicy });
    expect(BigInt(after.policyEpoch ?? "0")).toBeGreaterThan(BigInt(before.policyEpoch ?? "0"));
    expect(await f.db.checkSchedule.findMany()).toEqual(schedules);
    expect(await f.db.keyword.findMany({ orderBy: { id: "asc" } })).toEqual(keywords);
    expect(await f.db.rankCheck.findMany()).toEqual(history);
    expect(await f.db.rankCheckRun.count()).toBe(0);
    expect(await f.db.measurementDefinitionHead.count()).toBe(0);
    const audit = await f.db.auditLog.findMany({
      where: { action: "measurement_definition.configure", projectId },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorId: null,
      after: { operation: "migration", migrationId: legacyWebPolicyMigration.id },
    });
    for (const actor of [f.project.writer.id, null]) {
      const owned = await f.create(actor);
      await f.db.$transaction((tx) =>
        fencePaidAttemptsInTransaction(tx, [owned.grant], { beforeFence: owned.hook }),
      );
      const proof = await f.client.query(
        "SELECT fenced_at FROM metering_paid_attempt_context WHERE namespace=$1 AND operation_id=$2",
        [f.namespace, owned.grant.operation.operationId],
      );
      expect(proof.rows[0].fenced_at).not.toBeNull();
      expect(owned.binding.request.adapterVersion).toBe("dataforseo-observation-v1");
    }
  } finally {
    await f.close();
  }
});

it("retains explicitly configured freshness, skips finished replay and leaves later projects unconfigured", async () => {
  const f = await definitionDatabaseFixture();
  try {
    const projectId = f.project.project.id;
    const initial = await f.db.$transaction((tx) => readHostPolicySnapshot(tx, projectId));
    await configureHostDefinitionPolicy(f.db, f.project.writerContext, {
      projectId: f.project.project.publicId,
      expectedPolicyEpoch: initial.policyEpoch,
      manualTtlMs: 12345,
      cadenceGraceMs: 321,
      confirmed: true,
    });
    const before = await f.db.$transaction((tx) => readHostPolicySnapshot(tx, projectId));
    await migrate(f);
    const later = await f.db.project.create({
      data: {
        name: "Later project",
        domain: "later.example.test",
        publicId: makePublicId("prj"),
        ownerId: f.project.owner.id,
      },
    });
    await migrate(f);
    expect(await f.db.$transaction((tx) => readHostPolicySnapshot(tx, projectId))).toEqual(before);
    expect(await f.db.$transaction((tx) => readHostPolicySnapshot(tx, later.id))).toMatchObject({
      state: "unconfigured",
      config: null,
    });
    expect(await f.db.rankCheckRun.count()).toBe(0);
    expect(await f.db.measurementDefinitionHead.count()).toBe(0);
  } finally {
    await f.close();
  }
});

it("rolls policy back when its audit fails and resumes only the original pre-start cohort", async () => {
  const f = await definitionDatabaseFixture();
  try {
    await f.client.query(`CREATE FUNCTION reject_owned_policy_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action='measurement_definition.configure' AND NEW."actorId" IS NULL
      THEN RAISE EXCEPTION 'owned_policy_audit_failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER owned_policy_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_owned_policy_audit()`);
    await expect(migrate(f)).rejects.toThrow("owned_policy_audit_failure");
    const original = await f.db.$transaction((tx) =>
      readHostPolicySnapshot(tx, f.project.project.id),
    );
    expect(original.state).toBe("unconfigured");
    const later = await f.db.project.create({
      data: {
        name: "After interrupted start",
        domain: "later.example.test",
        publicId: makePublicId("prj"),
        ownerId: f.project.owner.id,
      },
    });
    await f.client.query(
      "DROP TRIGGER owned_policy_audit ON audit_logs; DROP FUNCTION reject_owned_policy_audit()",
    );
    await migrate(f);
    expect(
      await f.db.$transaction((tx) => readHostPolicySnapshot(tx, f.project.project.id)),
    ).toMatchObject({ state: "ready", config: legacyWebPolicy });
    expect(await f.db.$transaction((tx) => readHostPolicySnapshot(tx, later.id))).toMatchObject({
      state: "unconfigured",
      config: null,
    });
    expect(
      await f.db.auditLog.count({
        where: { action: "measurement_definition.configure", actorId: null },
      }),
    ).toBe(1);
    expect(await f.db.rankCheckRun.count()).toBe(0);
  } finally {
    await f.close();
  }
});
