import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "prisma/migrations/20260903210000_welcome_followup_intent/migration.sql",
  "utf8",
);

describe("welcome follow-up intent migration", () => {
  it("adds nullable intent fields without backfilling existing users", () => {
    expect(migration).toContain('ADD COLUMN "welcomeFollowupRequestedAt" TIMESTAMP(3)');
    expect(migration).not.toMatch(/welcomeFollowupRequestedAt"\s+TIMESTAMP\(3\)\s+NOT NULL/i);
    expect(migration).not.toMatch(/\bDEFAULT\b/i);
    expect(migration).not.toMatch(/\bUPDATE\s+"?users"?\b/i);
  });

  it("makes expired intents countable by a dedicated terminal timestamp", () => {
    expect(migration).toContain('ADD COLUMN "welcomeFollowupExpiredAt" TIMESTAMP(3)');
  });
});
