import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("adds the research accounting kind without replacing existing enum values", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `CREATE TYPE "ProviderCostFeature" AS ENUM ('rank_check','ai_visibility','prompt_explorer');`,
    );
    await db.exec(
      await readFile(
        new URL(
          "../../prisma/migrations/20261024070000_prompt_research_kind/migration.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    expect(
      (
        await db.query<{ value: string }>(
          `SELECT unnest(enum_range(NULL::"ProviderCostFeature"))::text AS value`,
        )
      ).rows.map((row) => row.value),
    ).toEqual(["rank_check", "ai_visibility", "prompt_explorer", "prompt_research"]);
  } finally {
    await db.close();
  }
}, 30_000);
