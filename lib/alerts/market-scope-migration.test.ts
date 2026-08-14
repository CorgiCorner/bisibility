import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "prisma/migrations/20260814015500_alert_rule_markets/migration.sql"),
  "utf8",
);

describe("alert rule market migration", () => {
  it("uses normalized unique rows with cascading parent cleanup", () => {
    expect(migration).toContain('CREATE TABLE "alert_rule_markets"');
    expect(migration).toContain('("ruleId", "projectMarketId")');
    expect(migration).toMatch(
      /REFERENCES "alert_rules"\("id"\) ON DELETE CASCADE ON UPDATE CASCADE/,
    );
    expect(migration).toMatch(
      /REFERENCES "project_markets"\("id"\) ON DELETE CASCADE ON UPDATE CASCADE/,
    );
    expect(migration).not.toMatch(/INSERT|UPDATE "alert_rule_markets"/);
  });
});
