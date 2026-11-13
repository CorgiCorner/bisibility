import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const original = readFileSync(
  new URL(
    "../../prisma/migrations/20261016060000_activity_achievements/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const added = readFileSync(
  new URL(
    "../../prisma/migrations/20261110213500_achievement_thirty_days/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("30-day achievement storage", () => {
  it("stores one enrollment and lets the shared award row use the new kind", async () => {
    const db = new PGlite();
    try {
      await db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES ('a');`);
      await db.exec(original);
      await db.exec(added);
      await db.exec(
        `INSERT INTO achievement_enrollments ("userId", kind, "definitionVersion", "joinedOn", "timeZone", "updatedAt") VALUES ('a','thirty_days',1,'2026-11-08','Europe/Warsaw',now())`,
      );
      await expect(
        db.exec(
          `INSERT INTO achievement_enrollments ("userId", kind, "definitionVersion", "joinedOn", "timeZone", "updatedAt") VALUES ('a','thirty_days',1,'2026-11-09','UTC',now())`,
        ),
      ).rejects.toThrow();
      await db.exec(
        `INSERT INTO achievement_awards (id,"userId",kind,epoch,"earnedDay","timeZone") VALUES ('award-30','a','thirty_days',1,'2026-12-29','Europe/Warsaw')`,
      );
      await expect(
        db.exec(
          `INSERT INTO achievement_awards (id,"userId",kind,epoch,"earnedDay","timeZone") VALUES ('award-bad','a','health',1,'2026-12-29','UTC')`,
        ),
      ).rejects.toThrow();
      await expect(
        db.exec(
          `INSERT INTO achievement_days (id,"userId",epoch,kind,"localDay","timeZone") VALUES ('day','a',1,'thirty_days','2026-11-08','UTC')`,
        ),
      ).rejects.toThrow();
      await db.exec(`DELETE FROM users WHERE id='a'`);
      expect((await db.query("SELECT * FROM achievement_enrollments")).rows).toHaveLength(0);
      expect((await db.query("SELECT * FROM achievement_awards")).rows).toHaveLength(0);
    } finally {
      await db.close();
    }
  }, 20000);
});
