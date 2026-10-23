import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, it } from "vitest";
import { readSchedulerUpgradeConflicts } from "./scheduler-upgrade-conflicts";
import { repairMissingScheduleAssignments } from "./scheduler-upgrade-repair";
import { schedulerUpgradeConflicts } from "./scheduler-upgrade-store";

it.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "checks legacy versus named intent on real PostgreSQL without rewriting it",
  async () => {
    const client = new Client({ connectionString: process.env.PROVIDER_UI_TEST_DATABASE_URL });
    const schema = `d2_${randomUUID().replaceAll("-", "")}`;
    await client.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"; SET search_path TO "${schema}";
      CREATE TABLE users (id text, "deactivatedAt" timestamp);
      CREATE TABLE projects (id text, "publicId" text, "ownerId" text, "writeMode" text);
      CREATE TABLE keywords (id text, "publicId" text, "projectId" text, "checkScheduleId" text, "archivedAt" timestamp, text text DEFAULT 'example keyword');
      CREATE TABLE project_defaults ("projectId" text, frequency text, timezone text, "jitterMinutes" int, "cronExpression" text);
      CREATE TABLE keyword_schedules (id text, "keywordId" text, frequency text, timezone text, "jitterMinutes" int, "cronExpression" text, "serpDepth" int);
      CREATE TABLE check_schedules (id text, "publicId" text, name text, "timeOfDay" text, "projectId" text, enabled boolean, frequency text, timezone text, "jitterMinutes" int, "cronExpression" text, "archivedAt" timestamp);
      INSERT INTO users VALUES ('u',NULL);
      INSERT INTO projects VALUES ('p','prj_p','u','active');
      INSERT INTO project_defaults VALUES ('p','daily','UTC',60,NULL);
      INSERT INTO check_schedules VALUES ('s','sch_s','Daily',NULL,'p',true,'daily',NULL,60,NULL,NULL);
      INSERT INTO keywords (id,"publicId","projectId","checkScheduleId","archivedAt") VALUES ('matched','matched','p','s',NULL),('missing','missing','p',NULL,NULL),('paused','paused','p',NULL,NULL);
      INSERT INTO keyword_schedules (id,"keywordId",frequency,timezone,"jitterMinutes","cronExpression") VALUES ('ks1','matched','daily','UTC',60,NULL),('ks2','paused','paused','UTC',60,NULL);`);
      const database = {
        $queryRaw: async (sql: { text: string; values: unknown[] }) =>
          (await client.query(sql.text, sql.values)).rows,
      };
      expect(await schedulerUpgradeConflicts(database as never)).toEqual(["missing"]);
      await client.query(
        'UPDATE users SET "deactivatedAt"=NOW(); UPDATE projects SET "writeMode"=\'paused\'; UPDATE keywords SET "archivedAt"=NOW() WHERE id=\'missing\'',
      );
      expect(await readSchedulerUpgradeConflicts(database as never)).toEqual([
        expect.objectContaining({
          keywordId: "missing",
          projectId: "prj_p",
          projectWriteMode: "paused",
          ownerDeactivated: true,
          keywordArchived: true,
          reason: "missing_assignment",
          legacyFrequency: "daily",
        }),
      ]);
      const repairDb = {
        ...database,
        $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            ...database,
            checkSchedule: {
              findMany: async ({
                where,
              }: {
                where: { projectId: string; frequency: string; jitterMinutes: number };
              }) =>
                (
                  await client.query(
                    'SELECT * FROM check_schedules WHERE enabled AND "archivedAt" IS NULL AND "projectId"=$1 AND frequency=$2 AND "jitterMinutes"=$3',
                    [where.projectId, where.frequency, where.jitterMinutes],
                  )
                ).rows,
              create: async ({ data }: { data: Record<string, unknown> }) =>
                (
                  await client.query(
                    "INSERT INTO check_schedules VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULL) RETURNING *",
                    [
                      randomUUID(),
                      data.publicId,
                      data.name,
                      data.timeOfDay,
                      data.projectId,
                      data.enabled,
                      data.frequency,
                      data.timezone,
                      data.jitterMinutes,
                      data.cronExpression,
                    ],
                  )
                ).rows[0],
            },
            keyword: {
              updateMany: async ({
                where,
                data,
              }: {
                where: { id: string; projectId: string };
                data: { checkScheduleId: string };
              }) => ({
                count: (
                  await client.query(
                    'UPDATE keywords SET "checkScheduleId"=$1 WHERE id=$2 AND "projectId"=$3 AND "checkScheduleId" IS NULL',
                    [data.checkScheduleId, where.id, where.projectId],
                  )
                ).rowCount,
              }),
            },
          }),
      };
      expect(await repairMissingScheduleAssignments(false, repairDb as never)).toMatchObject({
        assignments: [{ resolution: "unique_match", assigned: false }],
      });
      expect(await schedulerUpgradeConflicts(database as never)).toEqual(["missing"]);
      await client.query(
        "INSERT INTO check_schedules SELECT 'duplicate','sch_duplicate','Other daily',NULL,\"projectId\",enabled,frequency,timezone,\"jitterMinutes\",\"cronExpression\",\"archivedAt\" FROM check_schedules WHERE id='s'",
      );
      expect(await repairMissingScheduleAssignments(true, repairDb as never)).toMatchObject({
        assignments: [{ resolution: "multiple_matches", assigned: false }],
      });
      expect(
        await repairMissingScheduleAssignments(false, repairDb as never, {
          selectMatches: { missing: "sch_duplicate" },
        }),
      ).toMatchObject({ assignments: [{ resolution: "selected_match", assigned: false }] });
      await expect(
        repairMissingScheduleAssignments(true, repairDb as never, {
          selectMatches: { missing: "sch_wrong" },
        }),
      ).rejects.toThrow("does not preserve legacy intent");
      await client.query("DELETE FROM check_schedules WHERE id='duplicate'");
      expect(await repairMissingScheduleAssignments(true, repairDb as never)).toMatchObject({
        assignments: [{ resolution: "unique_match", assigned: true }],
      });
      expect(await schedulerUpgradeConflicts(database as never)).toEqual([]);

      await client.query(
        "UPDATE keywords SET \"checkScheduleId\"='s' WHERE id='missing'; UPDATE keyword_schedules SET frequency='weekly' WHERE id='ks1'",
      );
      expect(await schedulerUpgradeConflicts(database as never)).toEqual(["matched"]);
      await client.query(
        "UPDATE keyword_schedules SET frequency='daily' WHERE id='ks1'; UPDATE check_schedules SET enabled=false",
      );
      expect(await schedulerUpgradeConflicts(database as never)).toEqual(["matched"]);
      await client.query("UPDATE keyword_schedules SET frequency='paused' WHERE id='ks1'");
      expect(await schedulerUpgradeConflicts(database as never)).toEqual([]);
      expect(
        (await client.query("SELECT frequency FROM keyword_schedules WHERE id='ks2'")).rows[0]
          .frequency,
      ).toBe("paused");
      await client.query(
        `INSERT INTO keywords (id,"publicId","projectId","checkScheduleId","archivedAt") VALUES ('recovered','recovered','p',NULL,NULL)`,
      );
      expect(
        await repairMissingScheduleAssignments(false, repairDb as never, { createMissing: true }),
      ).toMatchObject({
        assignments: [{ keywordId: "recovered", resolution: "create_schedule", assigned: false }],
        newSchedules: [{ frequency: "daily", timezone: "UTC", jitterMinutes: 60 }],
      });
      expect(
        await repairMissingScheduleAssignments(true, repairDb as never, { createMissing: true }),
      ).toMatchObject({
        assignments: [{ keywordId: "recovered", resolution: "create_schedule", assigned: true }],
      });
      expect(await schedulerUpgradeConflicts(database as never)).toEqual([]);
      expect(
        (await client.query("SELECT \"checkScheduleId\" FROM keywords WHERE id='paused'")).rows[0]
          .checkScheduleId,
      ).toBeNull();
    } finally {
      await client.query(`DROP SCHEMA "${schema}" CASCADE`);
      await client.end();
    }
  },
);
