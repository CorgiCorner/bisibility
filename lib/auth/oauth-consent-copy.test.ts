import { describe, expect, it } from "vitest";
import { getOAuthConsentCopy } from "./oauth-consent-copy";

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
