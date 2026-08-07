import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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

  it("installs the final verification fields and safe indexes in the baseline", () => {
    const baseline = source("prisma/migrations/20260806000000_squashed_migrations/migration.sql");

    expect(baseline).toContain('"verified" BOOLEAN DEFAULT true');
    expect(baseline).toContain('"failedVerificationCount" INTEGER DEFAULT 0');
    expect(baseline).toContain('"lockedUntil" TIMESTAMP(3)');
    expect(baseline).toContain('CREATE INDEX "twoFactor_userId_idx"');
    expect(baseline).not.toContain('"twoFactor_secret_idx"');
  });
});
