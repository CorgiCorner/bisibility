import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL(
    "../../prisma/migrations/20261016060000_activity_achievements/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
describe("achievement storage", () => {
  it("enforces one fact per owner/calendar day, one permanent badge, mail claims and account cleanup", async () => {
    const db = new PGlite();
    try {
      await db.exec(
        `CREATE TABLE users(id TEXT PRIMARY KEY);INSERT INTO users VALUES ('a'),('b');`,
      );
      await db.exec(sql);
      const fact = `INSERT INTO achievement_days (id,"userId",epoch,kind,"localDay","timeZone") VALUES ('x','a',1,'presence','2026-10-16','UTC')`;
      await db.exec(fact);
      await db.exec(fact.replace("'x'", "'y'") + ` ON CONFLICT DO NOTHING`);
      expect(
        (await db.query<{ n: number }>("SELECT count(*)::int n FROM achievement_days")).rows[0].n,
      ).toBe(1);
      await db.exec(fact.replace("'x'", "'z'").replace("'a'", "'b'"));
      await expect(
        db.exec(fact.replace("'x'", "'bad'").replace("'presence'", "'health'")),
      ).rejects.toThrow();
      const award = `INSERT INTO achievement_awards(id,"userId",kind,epoch,"earnedDay","timeZone") VALUES('award-a','a','presence',1,'2026-10-16','UTC')`;
      await db.exec(award);
      await expect(
        db.exec(award.replace("'award-a'", "'duplicate'").replace(",1,", ",2,")),
      ).rejects.toThrow();
      await db.exec(
        `INSERT INTO achievement_mails(id,"userId",epoch,"awardDay","timeZone","dueAt") VALUES('m','a',1,'2026-10-16','UTC',now())`,
      );
      const claim = `UPDATE achievement_mails SET status='sending' WHERE id='m' AND status='queued' RETURNING id`;
      expect((await db.query(claim)).rows).toHaveLength(1);
      expect((await db.query(claim)).rows).toHaveLength(0);
      await db.exec(`DELETE FROM users WHERE id='a'`);
      expect((await db.query("SELECT * FROM achievement_days")).rows).toHaveLength(1);
      expect((await db.query("SELECT * FROM achievement_awards")).rows).toHaveLength(0);
      expect((await db.query("SELECT * FROM achievement_mails")).rows).toHaveLength(0);
    } finally {
      await db.close();
    }
  }, 20000);
});
