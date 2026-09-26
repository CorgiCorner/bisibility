import { describe, expect, it } from "vitest";
import { integrationCategories } from "./integrations-fixtures";
import { oauthScopes, testSuccessPresentation } from "./provider-auth";

describe("oauthScopes", () => {
  it("describes the scopes actually requested by the Search Console flow", () => {
    expect(oauthScopes(integrationCategories[1].providers[0])).toEqual([
      "search_console_readonly",
      "account_identity",
    ]);
  });
});

describe("testSuccessPresentation", () => {
  it("keeps provider balances structured until the localized drawer renders them", () => {
    expect(
      testSuccessPresentation("serpapi", { balance: 41_200, message: "Connected.", ok: true }),
    ).toEqual({ balance: { kind: "searches", value: 41_200 }, kind: "verified", message: null });
    expect(
      testSuccessPresentation("dataforseo", { balance: 4.5, message: "Ok.", ok: true }),
    ).toEqual({ balance: { kind: "currency", value: 4.5 }, kind: "verified", message: null });
  });

  it("keeps external provider details while structuring known application success", () => {
    expect(testSuccessPresentation("dataforseo", { message: "Ok.", ok: true })).toEqual({
      balance: null,
      kind: "verified",
      message: null,
    });
    expect(
      testSuccessPresentation("plausible", { message: "Connected · example.com.", ok: true }),
    ).toEqual({ balance: null, kind: "application_connection", message: "example.com." });
    expect(
      testSuccessPresentation("gsc", {
        message: "Connected · sc-domain:example.com (siteUnverifiedUser).",
        ok: true,
      }),
    ).toEqual({
      balance: null,
      kind: "application_connection",
      message: "sc-domain:example.com (siteUnverifiedUser).",
    });
    expect(
      testSuccessPresentation("plausible", {
        message: "Connection accepted with a warning.",
        ok: true,
      }),
    ).toEqual({
      balance: null,
      kind: "provider_message",
      message: "Connection accepted with a warning.",
    });
  });
});
