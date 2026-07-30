import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
const schema = source("../../prisma/schema.prisma");
const coreMigration = source(
  "../../prisma/migrations/20260727200000_public_id_expand_core/migration.sql",
);
const highVolumeMigration = source(
  "../../prisma/migrations/20260727203000_public_id_expand_high_volume/migration.sql",
);
const contractMigration = source(
  "../../prisma/migrations/20260728063000_public_id_contract/migration.sql",
);

function model(name: string) {
  const heading = `model ${name} {`;
  const start = schema.indexOf(heading);
  if (start < 0) throw new Error(`Missing Prisma model: ${name}`);
  const bodyStart = start + heading.length;
  const end = schema.indexOf("\n}", bodyStart);
  if (end < 0) throw new Error(`Unterminated Prisma model: ${name}`);
  return schema.slice(bodyStart, end);
}

const publicIdModels = [
  "User",
  "Session",
  "Membership",
  "Project",
  "Keyword",
  "SavedKeyword",
  "Tag",
  "Competitor",
  "RankCheck",
  "ProviderConnection",
  "ApiKey",
  "PersonalAccessToken",
  "AuditLog",
  "AlertRule",
  "TriggeredAlert",
  "WebhookEndpoint",
  "SavedView",
  "Notification",
  "Invite",
  "MigrationToken",
  "CloudImportJob",
  "IngestHook",
  "Signal",
] as const;

describe("public-ID final schema contract", () => {
  it("makes every independently addressable public ID non-null and unique", () => {
    for (const name of publicIdModels) {
      const definition = model(name);
      expect(definition).toMatch(/publicId\s+String\s+@unique/);
      expect(definition).not.toMatch(/publicId\s+String\?/);
    }
  });

  it("drops temporary migration storage and backlink snapshot identity", () => {
    expect(schema).not.toContain("enum PublicIdEntityType");
    expect(schema).not.toContain("model PublicIdMigration");
    expect(model("BacklinkSnapshot")).not.toMatch(/publicId/);
  });

  it("ships the self-guarding final contract migration", () => {
    expect(coreMigration).toContain('CREATE TABLE "public_id_migrations"');
    expect(highVolumeMigration).toContain('ALTER TABLE "rank_checks" ADD COLUMN "publicId"');
    expect(contractMigration).toContain("-- data-migration-contract: self-guarding");
    expect(contractMigration).toContain("SET lock_timeout = '5s';");
    expect(contractMigration).toContain("RAISE EXCEPTION");
    expect(contractMigration).toContain('DROP TABLE "public_id_migrations";');
    expect(contractMigration).toContain('DROP TYPE "PublicIdEntityType";');
    expect(contractMigration).toContain('ALTER TABLE "backlink_snapshots" DROP COLUMN "publicId";');
    expect(
      contractMigration.match(/regexp_replace\(constraint_definition, ' NOT VALID\$', ''\)/g),
    ).toHaveLength(2);
    expect(contractMigration).not.toMatch(/data_migrations/);
    expect(contractMigration).not.toMatch(/IF EXISTS|CASCADE/);
  });
});
