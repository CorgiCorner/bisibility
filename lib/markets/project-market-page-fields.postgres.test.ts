import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

describe("project market page fields migration", () => {
  it("backfills stable nonblank names and device defaults without changing market or keyword identity", async () => {
    const database = new PGlite();
    const migration = await readFile(
      new URL(
        "../../prisma/migrations/20260906210000_project_market_page_fields/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );

    try {
      await database.exec(`
        CREATE TYPE "Device" AS ENUM ('desktop', 'mobile');
        CREATE TABLE "locations" (
          "id" TEXT PRIMARY KEY,
          "displayName" TEXT NOT NULL
        );
        CREATE TABLE "project_markets" (
          "id" TEXT PRIMARY KEY,
          "publicId" TEXT UNIQUE NOT NULL,
          "projectId" TEXT NOT NULL,
          "locationId" TEXT NOT NULL,
          "status" TEXT NOT NULL,
          UNIQUE ("projectId", "locationId")
        );
        CREATE TABLE "keywords" (
          "id" TEXT PRIMARY KEY,
          "publicId" TEXT UNIQUE NOT NULL,
          "projectId" TEXT NOT NULL,
          "text" TEXT NOT NULL,
          "locationId" TEXT NOT NULL,
          "device" "Device" NOT NULL,
          "checkScheduleId" TEXT
        );
        CREATE TABLE "keyword_schedules" (
          "id" TEXT PRIMARY KEY,
          "keywordId" TEXT NOT NULL,
          "frequency" TEXT NOT NULL
        );
        INSERT INTO "locations" VALUES ('location_malaga', 'Malaga'), ('location_blank', '  ');
        INSERT INTO "project_markets" VALUES
          ('market_malaga', 'pmkt_abcdefghijklmnopqrstuvwx', 'project_1', 'location_malaga', 'active'),
          ('market_blank', 'pmkt_bbcdefghijklmnopqrstuvwx', 'project_1', 'location_blank', 'paused');
        INSERT INTO "keywords" VALUES
          ('keyword_1', 'kw_abcdefghijklmnopqrstuvwx', 'project_1', 'best paella', 'location_malaga', 'desktop', 'schedule_1');
        INSERT INTO "keyword_schedules" VALUES ('schedule_1', 'keyword_1', 'weekly');
        ${migration}
      `);

      const markets = await database.query<{
        futureKeywordDevices: string;
        locationId: string;
        name: string;
        publicId: string;
      }>(
        'SELECT "futureKeywordDevices", "locationId", "name", "publicId" FROM "project_markets" ORDER BY "id"',
      );
      const keyword = await database.query<{
        checkScheduleId: string;
        device: string;
        locationId: string;
        text: string;
      }>('SELECT "checkScheduleId", "device", "locationId", "text" FROM "keywords"');
      const schedule = await database.query<{ frequency: string }>(
        'SELECT "frequency" FROM "keyword_schedules"',
      );

      expect(markets.rows).toEqual([
        {
          futureKeywordDevices: "{desktop,mobile}",
          locationId: "location_blank",
          name: "Market location_blank",
          publicId: "pmkt_bbcdefghijklmnopqrstuvwx",
        },
        {
          futureKeywordDevices: "{desktop,mobile}",
          locationId: "location_malaga",
          name: "Malaga",
          publicId: "pmkt_abcdefghijklmnopqrstuvwx",
        },
      ]);
      expect(keyword.rows).toEqual([
        {
          checkScheduleId: "schedule_1",
          device: "desktop",
          locationId: "location_malaga",
          text: "best paella",
        },
      ]);
      expect(schedule.rows).toEqual([{ frequency: "weekly" }]);
      await expect(
        database.exec(
          'INSERT INTO "project_markets" ("id", "publicId", "projectId", "locationId", "status", "name") VALUES (\'duplicate\', \'pmkt_ccdefghijklmnopqrstuvwx\', \'project_1\', \'location_malaga\', \'active\', \'Duplicate\')',
        ),
      ).rejects.toThrow();
    } finally {
      await database.close();
    }
  });
});
