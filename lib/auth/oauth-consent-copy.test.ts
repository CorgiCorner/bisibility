import { describe, expect, it } from "vitest";
import { getOAuthConsentCopy, oauthConsentScopes } from "./oauth-consent-copy";

describe("OAuth consent copy", () => {
  it("names the first-party client and selects CLI retry guidance", () => {
    expect(
      getOAuthConsentCopy({
        dynamic: false,
        id: "bisibility-cli",
        name: "Bisibility CLI",
        redirectUri: "127.0.0.1:8976/callback",
      }),
    ).toMatchObject({
      clientName: "Bisibility CLI",
      retryCommand: "bisibility auth login",
    });
  });

  it("names a dynamically registered Codex client and selects agent retry guidance", () => {
    expect(
      getOAuthConsentCopy({
        dynamic: true,
        id: "dynamic_client_1",
        name: "Codex",
        redirectUri: "127.0.0.1:51008/callback/request",
      }),
    ).toMatchObject({
      clientName: "Codex",
      retryCommand: "codex mcp login bisibility",
    });
  });

  it("reports no name and no command for an unidentified client", () => {
    expect(
      getOAuthConsentCopy({
        dynamic: true,
        id: "dynamic_client_2",
        name: "Unknown client",
        redirectUri: null,
      }),
    ).toMatchObject({
      clientName: null,
      retryCommand: null,
    });
  });
});

describe("OAuth consent scopes", () => {
  const client = {
    dynamic: true,
    id: "client_1",
    name: "ChatGPT",
    redirectUri: "chat.example.com/callback",
  };
  it("removes write, admin, credential creation and unknown scopes", () => {
    expect(
      oauthConsentScopes(client, [
        "read",
        "write",
        "admin",
        "tokens:write",
        "custom",
        "offline_access",
        "read",
      ]),
    ).toEqual(["read", "offline_access"]);
  });
  it("never adds an unrequested read scope", () => {
    expect(oauthConsentScopes(client, ["admin"])).toEqual([]);
  });
  it("preserves requested access for other clients without granting extra scopes", () => {
    expect(oauthConsentScopes({ ...client, name: "Claude" }, ["read", "write"])).toEqual([
      "read",
      "write",
    ]);
  });
  it("does not recognize a callback containing a lookalike hostname", () => {
    expect(
      oauthConsentScopes(
        { ...client, name: "Custom", redirectUri: "chatgpt.com.example.com/callback" },
        ["admin"],
      ),
    ).toEqual(["admin"]);
  });
  it("handles a missing or malformed callback without hiding unknown permissions", () => {
    for (const redirectUri of [null, "["]) {
      expect(oauthConsentScopes({ ...client, name: "Custom", redirectUri }, ["custom"])).toEqual([
        "custom",
      ]);
    }
  });
});
