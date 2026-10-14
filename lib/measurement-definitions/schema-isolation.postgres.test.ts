import { readdir } from "node:fs/promises";
import { activeDataMigrationManifest } from "@/lib/data-migrations/manifest";
import { expect, it, vi } from "vitest";
import { definitionProjectScope } from "./access";
import { DefinitionIntegrityError } from "./errors";
import { readHostPolicySnapshot } from "./host-policy-snapshot";
import { schemaIsolationFixture } from "./schema-isolation.postgres.test-fixture";
import { definitionAuthorityInstalled, readDefinitionSource } from "./storage";

vi.mock("server-only", () => ({}));

it("migrates and reads a URL-selected preview schema beside an unchanged public ledger and authority", async () => {
  const f = await schemaIsolationFixture();
  try {
    const original = await f.bootstrap("public", false);
    const publicSnapshot = `SELECT to_jsonb(p) AS project,to_jsonb(m) AS migration FROM projects p CROSS JOIN data_migrations m ORDER BY m.id`;
    const publicBefore = (await original.client.query(publicSnapshot)).rows;
    const preview = await f.bootstrap("bisibility_preview_fixture", true);
    const sqlMigrations = (await readdir("prisma/migrations"))
      .filter((name) => /^\d{14}_/.test(name))
      .sort();
    const applied = await preview.client.query(
      `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`,
    );
    expect(applied.rows.map((row) => row.migration_name)).toEqual(sqlMigrations);
    const finished = await preview.client.query(
      `SELECT id FROM data_migrations WHERE "finishedAt" IS NOT NULL ORDER BY id`,
    );
    expect(finished.rows.map((row) => row.id)).toEqual(
      activeDataMigrationManifest().map((entry) => entry.id),
    );
    const context = { actor: f.actor };
    expect(
      await preview.db.$transaction((tx) =>
        definitionProjectScope(tx, context, f.projectPublicId, "read"),
      ),
    ).toMatchObject({ id: f.projectId });
    expect(
      await preview.db.$transaction((tx) => readHostPolicySnapshot(tx, f.projectId)),
    ).toMatchObject({ state: "ready" });
    expect(
      await original.db.$transaction((tx) => readHostPolicySnapshot(tx, f.projectId)),
    ).toMatchObject({ state: "unconfigured" });
    expect(
      await preview.db.$transaction((tx) =>
        readDefinitionSource(tx, f.projectId, preview.keyword.id),
      ),
    ).toMatchObject({ target: { text: "bisibility_preview_fixture" } });
    expect((await original.client.query(publicSnapshot)).rows).toEqual(publicBefore);
    const boundPublic = await preview.client.query(
      `SELECT public.measurement_definition_source($1,$2) AS source`,
      [f.projectId, original.keyword.id],
    );
    expect(boundPublic.rows[0].source).toMatchObject({ target: { text: "public" } });
    await preview.db.$transaction(async (tx) => {
      await tx.$executeRaw`CREATE TEMP TABLE projects (id text, "measurementPolicyEpoch" bigint, "measurementPolicyConfig" jsonb)`;
      expect(await readHostPolicySnapshot(tx, f.projectId)).toMatchObject({ state: "ready" });
      expect(await definitionAuthorityInstalled(tx)).toBe(true);
    });
    await preview.client.query(
      `ALTER TABLE measurement_target_revisions DROP CONSTRAINT measurement_target_keyword_fk`,
    );
    await expect(preview.db.$transaction((tx) => definitionAuthorityInstalled(tx))).rejects.toThrow(
      DefinitionIntegrityError,
    );
    expect(await original.db.$transaction((tx) => definitionAuthorityInstalled(tx))).toBe(true);
    expect(
      await original.db.project.findUnique({
        where: { id: f.projectId },
        select: { name: true, measurementPolicyConfig: true },
      }),
    ).toEqual({ name: "Public retained", measurementPolicyConfig: null });
  } finally {
    await f.close();
  }
}, 180_000);
