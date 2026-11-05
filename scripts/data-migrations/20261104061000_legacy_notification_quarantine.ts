import type {
  DataMigrationContext,
  DataMigrationDatabase,
  DataMigrationImplementation,
} from "./types";

const id = "20261104061000_legacy_notification_quarantine";
const sourceUrl = new URL(import.meta.url);

const candidate = `n."projectId" IS NULL AND n."legacyProjectQuarantinedAt" IS NULL AND (
  n.type IN ('alert_fired', 'check_complete', 'check_failed', 'import_done', 'import_failed',
    'provider_incident', 'manual_run_summary', 'scheduled_window_summary')
  OR EXISTS (
    SELECT 1 FROM jsonb_path_query(COALESCE(n.payload, 'null'::jsonb), '$.**') AS value
    WHERE (jsonb_typeof(value) = 'object' AND EXISTS (
      SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(value) = 'object' THEN value ELSE '{}'::jsonb END) AS field
      WHERE (field.key IN ('project', 'projectId', 'project_id', 'projectSlug', 'project_slug',
          'projectPublicId', 'projectRef', 'project_ref')
        AND jsonb_typeof(field.value) = 'string' AND length(btrim(field.value #>> '{}')) > 0)
        OR (field.key = 'project' AND jsonb_typeof(field.value) = 'object' AND EXISTS (
          SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(field.value) = 'object' THEN field.value ELSE '{}'::jsonb END) AS project_field
          WHERE project_field.key IN ('id', 'slug', 'publicId')
            AND jsonb_typeof(project_field.value) = 'string'
            AND length(btrim(project_field.value #>> '{}')) > 0
        ))
    )) OR (jsonb_typeof(value) = 'string' AND
      value #>> '{}' ~ '(^|/)(p|projects)/[^/?#]+|(^|/)app/prj_[^/?#]+')
  )
)`;

// Page by primary key before evaluating the recursive payload predicate.
async function scan(db: DataMigrationDatabase, batchSize: number, update: boolean, log?: (line: string) => void) {
  let cursor = "";
  let total = 0;
  for (;;) {
    await db.query("BEGIN");
    try {
      await db.query("SET LOCAL lock_timeout = '2s'");
      await db.query("SET LOCAL statement_timeout = '10s'");
      const page = await db.query(
        `SELECT id FROM notifications WHERE id > $1 ORDER BY id LIMIT $2`,
        [cursor, batchSize],
      );
      const ids = page.rows.map((row) => {
        if (typeof row.id !== "string") throw new Error("Invalid notification ID.");
        return row.id;
      });
      if (ids.length) {
        const result = update
          ? await db.query(
              `WITH page AS MATERIALIZED (SELECT * FROM notifications WHERE id = ANY($1::text[]))
               UPDATE notifications target SET "legacyProjectQuarantinedAt"=clock_timestamp()
               FROM page n WHERE target.id = n.id AND target."projectId" IS NULL
                 AND target."legacyProjectQuarantinedAt" IS NULL AND ${candidate} RETURNING target.id`, [ids],
            )
          : await db.query(
              `WITH page AS MATERIALIZED (SELECT * FROM notifications WHERE id = ANY($1::text[]))
               SELECT n.id FROM page n WHERE ${candidate}`, [ids],
            );
        total += result.rows.length;
      }
      await db.query("COMMIT");
      log?.(`data migration ${id}: scanned=${ids.length}`);
      if (ids.length < batchSize) return total;
      cursor = ids[ids.length - 1];
    } catch (error) {
      await db.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }
}

export async function previewLegacyNotificationQuarantine(db: DataMigrationDatabase, batchSize = 500) {
  return scan(db, batchSize, false);
}

async function run({ db, batchSize, log }: DataMigrationContext) {
  log(`data migration ${id}: dry-run candidates=${await previewLegacyNotificationQuarantine(db, batchSize)}`);
  await scan(db, batchSize, true, log);
}

export const legacyNotificationQuarantineMigration = {
  id,
  sourceUrl,
  replaySafe: true,
  run,
  checksumInputs: [{ label: "migration", url: sourceUrl }],
} satisfies DataMigrationImplementation;
