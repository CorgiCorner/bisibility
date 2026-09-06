import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

describe("running rank-check run item index", () => {
  it("allows queued history but rejects a second running target", async () => {
    const database = new PGlite();
    const migration = await readFile(
      new URL(
        "../../../prisma/migrations/20260904030000_rank_check_running_item_unique/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await database.exec(`
      CREATE TABLE rank_check_run_items (
        id text PRIMARY KEY,
        "keywordId" text NOT NULL,
        status text NOT NULL
      );
      ${migration}
      INSERT INTO rank_check_run_items VALUES ('item_1', 'keyword_1', 'queued');
      INSERT INTO rank_check_run_items VALUES ('item_2', 'keyword_1', 'running');
    `);

    await expect(
      database.exec("INSERT INTO rank_check_run_items VALUES ('item_3', 'keyword_1', 'running')"),
    ).rejects.toThrow();
    await expect(
      database.exec("INSERT INTO rank_check_run_items VALUES ('item_4', 'keyword_1', 'queued')"),
    ).resolves.toEqual(expect.any(Array));
    await database.close();
  });
});
