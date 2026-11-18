import { randomUUID } from "node:crypto";
import { makePublicId } from "@/lib/db/public-id";
import { projectSyncPausesMigration } from "@/scripts/data-migrations/20261117213100_project_sync_pauses";
import { Client } from "pg";
import { expect, it } from "vitest";

const url = process.env.PROVIDER_UI_TEST_DATABASE_URL;

it.skipIf(!url)(
  "backfills the deployed table, enforces unique kinds and cascades deletes",
  async () => {
    if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) {
      throw new Error("A disposable loopback Postgres database is required");
    }
    const client = new Client({ connectionString: url });
    const owner = randomUUID();
    const projectId = randomUUID();
    await client.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        'INSERT INTO users (id, "publicId", name, email, "updatedAt") VALUES ($1, $2, $3, $4, now())',
        [owner, makePublicId("usr"), "Pause migration fixture", `${owner}@example.com`],
      );
      await client.query(
        `INSERT INTO projects (id, "publicId", "ownerId", name, "updatedAt",
        "domainRatingEnabled", "sitemapMonitoringEnabled")
        VALUES ($1, $2, $3, 'Pause migration fixture', now(), false, false)`,
        [projectId, makePublicId("prj"), owner],
      );
      const context = {
        batchSize: 1,
        db: {
          query: (sql: string, values?: readonly unknown[]) =>
            client.query(sql, values ? [...values] : undefined),
        },
        log: () => undefined,
      };
      await projectSyncPausesMigration.run(context);
      await projectSyncPausesMigration.run(context);
      const read = () =>
        client.query(
          'SELECT kind, "actorId" FROM project_sync_pauses WHERE "projectId" = $1 ORDER BY kind',
          [projectId],
        );
      expect((await read()).rows).toEqual([
        { kind: "domain_rating", actorId: null },
        { kind: "sitemap_fetch", actorId: null },
      ]);
      const insert = 'INSERT INTO project_sync_pauses (id, "projectId", kind) VALUES ($1, $2, $3)';
      await client.query(insert, [randomUUID(), projectId, "future_sync"]);
      await client.query("SAVEPOINT duplicate_kind");
      await expect(
        client.query(insert, [randomUUID(), projectId, "domain_rating"]),
      ).rejects.toMatchObject({
        code: "23505",
      });
      await client.query("ROLLBACK TO SAVEPOINT duplicate_kind");
      await client.query("DELETE FROM projects WHERE id = $1", [projectId]);
      expect((await read()).rows).toEqual([]);
    } finally {
      await client.query("ROLLBACK").finally(() => client.end());
    }
  },
);
