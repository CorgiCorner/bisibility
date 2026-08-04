import { describe, expect, it } from "vitest";
import { getOAuthConsentCopy } from "./oauth-consent-copy";

describe("OAuth consent copy", () => {
  it("uses CLI guidance for the first-party client id", () => {
    expect(
      getOAuthConsentCopy({
        dynamic: false,
        id: "bisibility-cli",
        name: "Bisibility CLI",
        redirectUri: "127.0.0.1:8976/callback",
      }),
    ).toMatchObject({
      heading: "Sign in to Bisibility CLI",
      persona: "cli",
      retryCommand: "bisibility auth login",
    });
  });

  it("uses agent guidance for a dynamically registered Codex client", () => {
    expect(
      getOAuthConsentCopy({
        dynamic: true,
        id: "dynamic_client_1",
        name: "Codex",
        redirectUri: "127.0.0.1:51008/callback/request",
      }),
    ).toMatchObject({
      heading: "Review agent access.",
      persona: "agent",
      retryCommand: "codex mcp login bisibility",
    });
  });

  it("uses generic guidance without a command for unknown clients", () => {
    expect(
      getOAuthConsentCopy({
        dynamic: true,
        id: "dynamic_client_2",
        name: "Unknown client",
        redirectUri: null,
      }),
    ).toMatchObject({
      heading: "Review client access.",
      persona: "generic",
      retryCommand: null,
    });
  });
});
