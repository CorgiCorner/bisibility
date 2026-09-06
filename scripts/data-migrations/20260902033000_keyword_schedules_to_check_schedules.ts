import { createId } from "@paralleldrive/cuid2";
import { makePublicId } from "@/lib/db/public-id";
import type {
  KeywordScheduleMigrationInput,
  LegacyScheduleValue,
  MigratedScheduleFrequency,
} from "@/lib/rank-check/schedules/migrate";
import { planProjectScheduleMigration } from "@/lib/rank-check/schedules/migrate";
import type { DataMigrationContext, DataMigrationImplementation } from "./types";

const id = "20260902033000_keyword_schedules_to_check_schedules";
const sourceUrl = new URL(import.meta.url);

type ProjectScheduleRow = {
  defaultCronExpression: string | null;
  defaultFrequency: MigratedScheduleFrequency;
  defaultJitterMinutes: number;
  defaultTimezone: string;
  keywordId: string;
  scheduleCronExpression: string | null;
  scheduleFrequency: MigratedScheduleFrequency | null;
  scheduleId: string | null;
  scheduleJitterMinutes: number | null;
  scheduleTimezone: string | null;
};

function legacySchedule(
  frequency: MigratedScheduleFrequency,
  cronExpression: string | null,
  timezone: string,
  jitterMinutes: number,
): LegacyScheduleValue {
  return { cronExpression, frequency, jitterMinutes, timezone };
}

function defaultSchedule(row: ProjectScheduleRow) {
  return legacySchedule(
    row.defaultFrequency,
    row.defaultCronExpression,
    row.defaultTimezone,
    row.defaultJitterMinutes,
  );
}

function keywordSchedule(row: ProjectScheduleRow): KeywordScheduleMigrationInput {
  if (!row.scheduleId) return { id: row.keywordId, schedule: null };
  if (
    !row.scheduleFrequency ||
    row.scheduleTimezone === null ||
    row.scheduleJitterMinutes === null
  ) {
    throw new Error(`Keyword ${row.keywordId} has an incomplete schedule row.`);
  }
  return {
    id: row.keywordId,
    schedule: legacySchedule(
      row.scheduleFrequency,
      row.scheduleCronExpression,
      row.scheduleTimezone,
      row.scheduleJitterMinutes,
    ),
  };
}

async function readProjectRows(context: DataMigrationContext, projectId: string) {
  const result = await context.db.query(
    `SELECT k."id" AS "keywordId",
            ks."id" AS "scheduleId",
            ks."frequency"::text AS "scheduleFrequency",
            ks."cronExpression" AS "scheduleCronExpression",
            ks."timezone" AS "scheduleTimezone",
            ks."jitterMinutes" AS "scheduleJitterMinutes",
            COALESCE(pd."frequency", 'daily'::"RankCheckFrequency")::text
              AS "defaultFrequency",
            pd."cronExpression" AS "defaultCronExpression",
            COALESCE(pd."timezone", 'UTC') AS "defaultTimezone",
            COALESCE(pd."jitterMinutes", 60) AS "defaultJitterMinutes"
       FROM "keywords" k
       LEFT JOIN "keyword_schedules" ks ON ks."keywordId" = k."id"
       LEFT JOIN "project_defaults" pd ON pd."projectId" = k."projectId"
      WHERE k."projectId" = $1
      ORDER BY k."id"`,
    [projectId],
  );
  return result.rows as unknown as ProjectScheduleRow[];
}

async function migrateProject(context: DataMigrationContext, projectId: string) {
  await context.db.query("BEGIN");
  try {
    const existing = await context.db.query(
      `SELECT "id"
         FROM "check_schedules"
        WHERE "projectId" = $1 AND "isDefault" = true
        LIMIT 1`,
      [projectId],
    );
    if (existing.rows.length > 0) {
      await context.db.query("COMMIT");
      return "skipped" as const;
    }

    const rows = await readProjectRows(context, projectId);
    const first = rows[0];
    if (!first) {
      await context.db.query("COMMIT");
      return "skipped" as const;
    }
    const schedules = planProjectScheduleMigration({
      alreadyHasDefault: false,
      defaultSchedule: defaultSchedule(first),
      keywords: rows.map(keywordSchedule),
    });

    for (const schedule of schedules) {
      const scheduleId = createId();
      await context.db.query(
        `INSERT INTO "check_schedules"
          ("id", "publicId", "projectId", "name", "frequency",
           "cronExpression", "timeOfDay", "timezone", "jitterMinutes",
           "enabled", "isDefault", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5::"RankCheckFrequency", $6, $7, $8, $9,
                 true, $10, NOW(), NOW())`,
        [
          scheduleId,
          makePublicId("sch"),
          projectId,
          schedule.name,
          schedule.frequency,
          schedule.cronExpression,
          schedule.timeOfDay,
          schedule.timezone,
          schedule.jitterMinutes,
          schedule.isDefault,
        ],
      );
      if (schedule.keywordIds.length > 0) {
        await context.db.query(
          `UPDATE "keywords"
              SET "checkScheduleId" = $1
            WHERE "projectId" = $2 AND "id" = ANY($3::text[])`,
          [scheduleId, projectId, schedule.keywordIds],
        );
      }
    }

    await context.db.query("COMMIT");
    return "migrated" as const;
  } catch (error) {
    await context.db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function run(context: DataMigrationContext) {
  let cursor = "";
  while (true) {
    const page = await context.db.query(
      `SELECT DISTINCT k."projectId" AS "projectId"
         FROM "keywords" k
        WHERE k."projectId" > $1
        ORDER BY k."projectId"
        LIMIT $2`,
      [cursor, context.batchSize],
    );
    if (page.rows.length === 0) return;

    let migrated = 0;
    let skipped = 0;
    for (const row of page.rows) {
      const projectId = String(row.projectId);
      const outcome = await migrateProject(context, projectId);
      if (outcome === "migrated") migrated += 1;
      else skipped += 1;
      cursor = projectId;
    }
    context.log(
      `data migration ${id}: batch processed=${page.rows.length} migrated=${migrated} skipped=${skipped} cursor=${cursor}`,
    );
    if (page.rows.length < context.batchSize) return;
  }
}

export const keywordSchedulesToCheckSchedulesMigration = {
  checksumInputs: [
    { label: `scripts/data-migrations/${id}.ts`, url: sourceUrl },
    {
      label: "lib/db/public-id.ts",
      url: new URL("../../lib/db/public-id.ts", import.meta.url),
    },
    {
      label: "lib/rank-check/cron.ts",
      url: new URL("../../lib/rank-check/cron.ts", import.meta.url),
    },
    {
      label: "lib/rank-check/schedules/migrate.ts",
      url: new URL("../../lib/rank-check/schedules/migrate.ts", import.meta.url),
    },
  ],
  id,
  run,
  sourceUrl,
} as const satisfies DataMigrationImplementation;
