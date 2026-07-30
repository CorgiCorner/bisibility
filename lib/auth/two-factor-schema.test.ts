import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const indexMigrationName = "20260723234500_drop_two_factor_secret_index";
const verificationMigrationName = "20260724070000_add_two_factor_verification_fields";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("two-factor schema hardening", () => {
  it("keeps the user lookup index and removes the secret index", () => {
    const schema = source("prisma/schema.prisma");
    const model = /model TwoFactor \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? "";

    expect(model).toContain("@@index([userId])");
    expect(model).not.toContain("@@index([secret])");
  });

  it("uses one off-hours migration that only drops the secret index", () => {
    const hour = Number(indexMigrationName.slice(8, 10));
    const migration = source(`prisma/migrations/${indexMigrationName}/migration.sql`).trim();

    expect(hour < 8 || hour >= 19).toBe(true);
    expect(migration).toBe('DROP INDEX "twoFactor_secret_idx";');
  });

  it("matches the installed two-factor verification fields", () => {
    const pluginSchema = source("node_modules/better-auth/dist/plugins/two-factor/schema.mjs");
    const prismaSchema = source("prisma/schema.prisma");
    const model = /model TwoFactor \{([\s\S]*?)\n\}/.exec(prismaSchema)?.[1] ?? "";

    expect(pluginSchema).toMatch(
      /verified: \{\s+type: "boolean",\s+required: false,\s+defaultValue: true,/,
    );
    expect(pluginSchema).toMatch(
      /failedVerificationCount: \{\s+type: "number",\s+required: false,\s+defaultValue: 0,/,
    );
    expect(pluginSchema).toMatch(/lockedUntil: \{\s+type: "date",\s+required: false,/);
    expect(model).toMatch(/verified\s+Boolean\?\s+@default\(true\)/);
    expect(model).toMatch(/failedVerificationCount\s+Int\?\s+@default\(0\)/);
    expect(model).toMatch(/lockedUntil\s+DateTime\?/);
  });

  it("adds the verification fields with safe defaults in one off-hours migration", () => {
    const hour = Number(verificationMigrationName.slice(8, 10));
    const migration = source(`prisma/migrations/${verificationMigrationName}/migration.sql`).trim();

    expect(hour < 8 || hour >= 19).toBe(true);
    expect(migration).toBe(`ALTER TABLE "twoFactor"
ADD COLUMN "verified" BOOLEAN DEFAULT true,
ADD COLUMN "failedVerificationCount" INTEGER DEFAULT 0,
ADD COLUMN "lockedUntil" TIMESTAMP(3);`);
  });
});
