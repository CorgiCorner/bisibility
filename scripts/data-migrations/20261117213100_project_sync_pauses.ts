import type { DataMigrationContext, DataMigrationImplementation } from "./types";

const id = "20261117213100_project_sync_pauses";
const sourceUrl = new URL(import.meta.url);

async function run({ db }: DataMigrationContext) {
  await db.query(`
    INSERT INTO project_sync_pauses (id, "projectId", kind)
    SELECT gen_random_uuid()::text, project.id, pause.kind
    FROM projects AS project
    CROSS JOIN LATERAL (VALUES
      ('domain_rating', NOT project."domainRatingEnabled"),
      ('sitemap_fetch', NOT project."sitemapMonitoringEnabled")
    ) AS pause(kind, disabled)
    WHERE pause.disabled
    ON CONFLICT ("projectId", kind) DO NOTHING
  `);
}

export const projectSyncPausesMigration = {
  id,
  sourceUrl,
  replaySafe: true,
  run,
  checksumInputs: [{ label: "migration", url: sourceUrl }],
} satisfies DataMigrationImplementation;
