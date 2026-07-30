import { describe, expect, it } from "vitest";
import { integrationCategories } from "./integrations-fixtures";
import { oauthScopes, testSuccessCopy } from "./provider-auth";

describe("oauthScopes", () => {
  it("describes the scopes actually requested by the Search Console flow", () => {
    expect(oauthScopes(integrationCategories[1].providers[0])).toEqual([
      "webmasters.readonly (property list + search analytics + sitemap status)",
      "openid email (account selection)",
    ]);
  });
});

describe("testSuccessCopy", () => {
  it("labels provider balances without inventing a usage forecast", () => {
    expect(testSuccessCopy("serpapi", { balance: 41_200, message: "Connected.", ok: true })).toBe(
      "Connected. · 41,200 searches remaining",
    );
    expect(testSuccessCopy("dataforseo", { balance: 4.5, message: "Connected.", ok: true })).toBe(
      "Connected. · Account balance: $4.5",
    );
  });

  it("uses the provider message when no balance is returned", () => {
    expect(
      testSuccessCopy("plausible", { message: "Connection OK · example.com.", ok: true }),
    ).toBe("Connection OK · example.com.");
  });
});
