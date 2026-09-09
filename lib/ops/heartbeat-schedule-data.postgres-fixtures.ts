import { PGlite } from "@electric-sql/pglite";

const POSTGRES_TIMESTAMP_OID = 1114;

export type ScheduleRawQuery = { text: string; values: unknown[] };

export async function createScheduleHeartbeatFixture() {
  const db = new PGlite({
    parsers: {
      [POSTGRES_TIMESTAMP_OID]: (value: string) => new Date(`${value.replace(" ", "T")}Z`),
    },
    serializers: {
      [POSTGRES_TIMESTAMP_OID]: (value: Date) => value.toISOString().replace("T", " ").slice(0, -1),
    },
  });
  await db.exec(`
    SET TIME ZONE 'UTC';
    CREATE TYPE "ProjectMarketStatus" AS ENUM ('active', 'paused', 'removed');
    CREATE TYPE "RankCheckFrequency" AS ENUM
      ('paused', 'manual', 'daily', 'weekly', 'monthly', 'custom_cron');
    CREATE TABLE users (id text PRIMARY KEY, "deactivatedAt" timestamp(3));
    CREATE TABLE projects (
      id text PRIMARY KEY, "ownerId" text NOT NULL,
      "writeMode" text NOT NULL DEFAULT 'active', "isSample" boolean NOT NULL DEFAULT false
    );
    CREATE TABLE project_markets (
      "projectId" text NOT NULL, "locationId" text NOT NULL, status "ProjectMarketStatus",
      PRIMARY KEY ("projectId", "locationId")
    );
    CREATE TABLE check_schedules (
      id text PRIMARY KEY, "projectId" text NOT NULL,
      frequency "RankCheckFrequency" NOT NULL DEFAULT 'daily',
      enabled boolean NOT NULL DEFAULT true, "archivedAt" timestamp(3)
    );
    CREATE TABLE keywords (
      id text PRIMARY KEY, "projectId" text NOT NULL, "locationId" text NOT NULL,
      "archivedAt" timestamp(3), "checkScheduleId" text
    );
    CREATE TABLE rank_check_runs (
      id text PRIMARY KEY, "projectId" text NOT NULL, "checkScheduleId" text,
      trigger text NOT NULL DEFAULT 'scheduled', "selectionKind" text NOT NULL DEFAULT 'scheduled_due',
      status text NOT NULL DEFAULT 'planned', "plannedFor" timestamp(3)
    );
    INSERT INTO users (id) VALUES ('owner');
    INSERT INTO projects (id, "ownerId") VALUES ('project', 'owner');
    INSERT INTO project_markets VALUES ('project', 'active', 'active');
    INSERT INTO check_schedules (id, "projectId") VALUES ('schedule', 'project');
  `);
  const queries: ScheduleRawQuery[] = [];
  const database = {
    $queryRaw: async <T>(query: ScheduleRawQuery) => {
      queries.push(query);
      return (await db.query(query.text, query.values)).rows as T;
    },
  };
  return { database, db, queries };
}
