import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("OAuthConsentExpired typography", () => {
  it("scopes the retry command Mono face to semantic code", () => {
    const source = readFileSync("components/auth/OAuthConsentExpired.tsx", "utf8");

    expect(source).not.toMatch(/<div[^>]*font-mono/);
    expect(source).toMatch(/<code>\s*\{copy\.retryCommand\}\s*<\/code>/);
  });
});
