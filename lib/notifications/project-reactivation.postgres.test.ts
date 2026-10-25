import { readFileSync } from "node:fs";
import { prisma } from "@/lib/db/prisma";
import {
  changeDimensions,
  enqueueIncident,
  incidentFixture,
} from "@/lib/provider-evidence/incidents/postgres.test-support";
import { markRecoveryAttemptStopped } from "@/lib/provider-evidence/recovery/capture";
import { assertRecoveryFixtureUrl } from "@/lib/provider-evidence/recovery/fixture-url.test-support";
import {
  cleanRecoveryFixtures,
  fixtureNamespace,
} from "@/lib/provider-evidence/recovery/postgres.test-support";
import { collectWeeklyDigestData } from "@/lib/reports/weekly-digest-data";
import { Client } from "pg";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeProjectIncidentsSilently } from "./close-project-incidents";
import { notificationTransaction } from "./transaction";

const publish = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("./realtime", () => ({ publishNotificationCreated: publish }));
const url = process.env.METERING_TEST_DATABASE_URL;
async function retireAndReactivate(projectId: string, cutoff = new Date()) {
  await notificationTransaction(async (tx) => {
    await closeProjectIncidentsSilently(tx, projectId, cutoff);
    await tx.project.update({ where: { id: projectId }, data: { writeMode: "migrated" } });
  });
  await prisma.project.update({ where: { id: projectId }, data: { writeMode: "active" } });
  publish.mockClear();
}

async function assertOldExcludedAndNewAllowed(
  f: Awaited<ReturnType<typeof incidentFixture>>,
  projectId: string,
  cutoff: Date,
) {
  await prisma.project.update({ where: { id: projectId }, data: { writeMode: "active" } });
  await markRecoveryAttemptStopped(f.check.id, "workflow_failed");
  expect(
    await prisma.providerIncidentOperation.findUnique({ where: { operationPk: f.operationPk } }),
  ).toBeNull();
  const fresh = await incidentFixture(projectId, new Date(cutoff.getTime() + 1));
  const current = await enqueueIncident(fresh);
  expect(
    await prisma.providerIncidentOperation.findMany({
      where: { incidentId: current.id },
      select: { operationPk: true },
    }),
  ).toEqual([{ operationPk: fresh.operationPk }]);
}

describe.skipIf(!url)("permanent incident retirement across project reactivation", () => {
  beforeEach(() => {
    assertRecoveryFixtureUrl(url);
    vi.stubEnv("METERING_NAMESPACE", fixtureNamespace);
    vi.stubEnv("PROVIDER_RECOVERY", "on");
    vi.stubEnv("BISIBILITY_SECRETS_KEY", Buffer.alloc(32, 7).toString("base64"));
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("Unexpected provider request");
      }),
    );
    publish.mockClear();
  });
  afterEach(async () => {
    await cleanRecoveryFixtures();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  afterAll(() => prisma.$disconnect());

  it("backfills through the database upgrade time despite an older recorded mode change", async () => {
    const f = await incidentFixture();
    await prisma.project.update({
      where: { id: f.project.id },
      data: {
        writeMode: "migrated",
        writeModeChangedAt: new Date(f.operation.created_at.getTime() - 60_000),
      },
    });
    const sql = readFileSync(
      new URL(
        "../../prisma/migrations/20261025213000_provider_incident_retirement/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const update = sql
      .split(";")
      .find((statement) => statement.includes('SET "providerIncidentsRetiredThrough"'));
    expect(update).toBeDefined();
    const [before] = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
    await prisma.$executeRawUnsafe(`${update} AND id = $1`, f.project.id);
    const p = await prisma.project.findUniqueOrThrow({ where: { id: f.project.id } });
    const cutoff = p.providerIncidentsRetiredThrough;
    if (!cutoff) throw new Error("Missing backfilled cutoff");
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before.now.getTime());
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(f.operation.created_at.getTime());
    await assertOldExcludedAndNewAllowed(f, f.project.id, cutoff);
  });

  it("takes the runtime cutoff after acquiring the project lock, including earlier active work", async () => {
    const owner = await incidentFixture();
    const blocker = new Client({ connectionString: url });
    await blocker.connect();
    let retirement: Promise<unknown> | undefined;
    try {
      await blocker.query("BEGIN");
      const {
        rows: [{ pid }],
      } = await blocker.query("SELECT pg_backend_pid() AS pid");
      await blocker.query("SELECT id FROM projects WHERE id=$1 FOR SHARE", [owner.project.id]);
      retirement = notificationTransaction(async (tx) => {
        await closeProjectIncidentsSilently(tx, owner.project.id);
        await tx.project.update({
          where: { id: owner.project.id },
          data: { writeMode: "migrated" },
        });
      });
      await expect
        .poll(
          async () => {
            const { rows } = await blocker.query(
              "SELECT EXISTS(SELECT 1 FROM pg_stat_activity a WHERE $1=ANY(pg_blocking_pids(a.pid))) AS waiting",
              [pid],
            );
            return rows[0].waiting;
          },
          { timeout: 4000, interval: 10 },
        )
        .toBe(true);
      const afterBlocked = Date.now();
      let operationTime: Date | undefined;
      await expect
        .poll(
          async () => {
            const {
              rows: [{ now }],
            } = await blocker.query("SELECT clock_timestamp() AS now");
            operationTime = now;
            return now.getTime();
          },
          { timeout: 4000, interval: 10 },
        )
        .toBeGreaterThan(afterBlocked);
      const pending = await incidentFixture(owner.project.id, operationTime);
      await blocker.query("COMMIT");
      await retirement;
      const p = await prisma.project.findUniqueOrThrow({ where: { id: owner.project.id } });
      const cutoff = p.providerIncidentsRetiredThrough;
      if (!cutoff) throw new Error("Missing locked cutoff");
      expect(cutoff.getTime()).toBeGreaterThanOrEqual(pending.operation.created_at.getTime());
      await assertOldExcludedAndNewAllowed(pending, owner.project.id, cutoff);
    } finally {
      await blocker.query("ROLLBACK");
      await blocker.end();
      await retirement?.catch(() => undefined);
    }
  });

  it("never reopens or republishes an old incident when its unresolved evidence changes", async () => {
    const f = await incidentFixture();
    const old = await enqueueIncident(f);
    const transitions = await prisma.providerIncidentTransition.findMany({
      where: { incidentId: old.id },
    });
    const operation = await prisma.meteringOperation.findUniqueOrThrow({
      where: { operation_pk: f.operationPk },
    });
    await retireAndReactivate(f.project.id);
    await changeDimensions(f.operationPk, { fulfillment: "partial" });
    expect(
      await prisma.providerIncident.findUniqueOrThrow({ where: { id: old.id } }),
    ).toMatchObject({ state: "resolved", version: old.version });
    expect(
      await prisma.providerIncidentTransition.findMany({ where: { incidentId: old.id } }),
    ).toEqual(transitions);
    expect(await prisma.notification.count({ where: { projectId: f.project.id } })).toBe(0);
    expect(publish).not.toHaveBeenCalled();
    expect(
      await prisma.meteringOperation.findUniqueOrThrow({ where: { operation_pk: f.operationPk } }),
    ).toEqual(operation);
  });

  it("excludes retired transitions from weekly attention after reactivation", async () => {
    const f = await incidentFixture();
    await enqueueIncident(f);
    await retireAndReactivate(f.project.id);
    expect(
      await collectWeeklyDigestData(f.project.id, new Date(Date.now() + 60_000), true),
    ).toBeNull();
    expect(await prisma.weeklyDigestSend.count({ where: { projectId: f.project.id } })).toBe(0);
  });

  it("does not mix old unlinked work with genuinely new same-cause operations", async () => {
    const f = await incidentFixture();
    const old = await enqueueIncident(f);
    const pending = await incidentFixture(f.project.id);
    const cutoff = new Date(Date.now() + 1000);
    await retireAndReactivate(f.project.id, cutoff);
    await markRecoveryAttemptStopped(pending.check.id, "workflow_failed");
    expect(
      await prisma.providerIncidentOperation.findUnique({
        where: { operationPk: pending.operationPk },
      }),
    ).toBeNull();
    const fresh = await incidentFixture(f.project.id, new Date(cutoff.getTime() + 1));
    const other = await incidentFixture(f.project.id, new Date(cutoff.getTime() + 2));
    await Promise.all([
      markRecoveryAttemptStopped(fresh.check.id, "workflow_failed"),
      markRecoveryAttemptStopped(other.check.id, "workflow_failed"),
    ]);
    const current = await prisma.providerIncident.findMany({
      where: { projectId: f.project.id, state: "open" },
      include: { operations: true },
    });
    expect(current).toHaveLength(1);
    expect(current[0].id).not.toBe(old.id);
    expect(current[0].cause).toBe(old.cause);
    expect(current[0].operations.map((op) => op.operationPk).sort()).toEqual(
      [fresh.operationPk, other.operationPk].sort(),
    );
    expect(
      await prisma.notification.count({
        where: { projectId: f.project.id, type: "provider_incident" },
      }),
    ).toBe(1);
    const digest = await collectWeeklyDigestData(
      f.project.id,
      new Date(cutoff.getTime() + 60_000),
      true,
    );
    expect(digest?.attention).toHaveLength(1);
    expect(digest?.attention?.[0].body).toContain("2 results under review");
  });
});
