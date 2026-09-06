import type { DataMigrationContext, DataMigrationImplementation } from "./types";

const id = "20260904210000_run_start_semantics";
const sourceUrl = new URL(import.meta.url);

async function run({ db, batchSize, log }: DataMigrationContext) {
  let cursor = "";
  for (;;) {
    await db.query("BEGIN");
    try {
      const page = await db.query(
        `SELECT id FROM rank_check_runs
         WHERE status = 'running' AND id > $1 ORDER BY id LIMIT $2 FOR UPDATE`,
        [cursor, batchSize],
      );
      if (page.rows.length === 0) {
        await db.query("COMMIT");
        return;
      }
      const ids = page.rows.map((row) => String(row.id));
      // A claimed target counts as started even before its check is linked.
      await db.query(
        `WITH starts AS (
           SELECT r.id, MIN(COALESCE(i."startedAt", c."startedAt", c."checkedAt")) AS first_start
           FROM rank_check_runs r
           LEFT JOIN rank_check_run_items i ON i."runId" = r.id
             AND (i."startedAt" IS NOT NULL OR (i."rankCheckId" IS NOT NULL
               AND i.status IN ('running', 'completed', 'failed', 'deferred')))
           LEFT JOIN rank_checks c ON c.id = i."rankCheckId"
           WHERE r.id = ANY($1::text[]) GROUP BY r.id
         )
         UPDATE rank_check_runs r
         SET status = CASE WHEN s.first_start IS NULL THEN 'queued' ELSE 'running' END,
             "startedAt" = s.first_start, "updatedAt" = NOW()
         FROM starts s WHERE r.id = s.id AND r.status = 'running'
           AND (s.first_start IS NULL OR r."startedAt" IS DISTINCT FROM s.first_start)`,
        [ids],
      );
      await db.query("COMMIT");
      cursor = ids[ids.length - 1];
      log(`data migration ${id}: processed=${ids.length}`);
      if (ids.length < batchSize) return;
    } catch (error) {
      await db.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }
}

export const runStartSemanticsMigration = {
  checksumInputs: [{ label: "migration", url: sourceUrl }],
  id,
  run,
  sourceUrl,
} satisfies DataMigrationImplementation;
