import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
const schema = source("../../prisma/schema.prisma");
const baseline = source("../../prisma/migrations/20260806000000_squashed_migrations/migration.sql");

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

  it("ships the strict final public ID catalog in the squashed baseline", () => {
    expect(baseline).toContain('CREATE TABLE "users"');
    expect(baseline).not.toContain('"public".');
    expect(baseline).toContain('CREATE UNIQUE INDEX "users_publicId_key"');
    expect(baseline).toContain('CONSTRAINT "users_public_id_contract_format" CHECK');
    expect(baseline).not.toContain("public_id_migrations");
    expect(baseline).not.toContain("PublicIdEntityType");
    const backlinkTable = baseline.slice(
      baseline.indexOf('CREATE TABLE "backlink_snapshots"'),
      baseline.indexOf(";", baseline.indexOf('CREATE TABLE "backlink_snapshots"')),
    );
    expect(backlinkTable).not.toContain('"publicId"');
  });
});
