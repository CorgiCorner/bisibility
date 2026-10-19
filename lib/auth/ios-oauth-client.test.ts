import { describe, expect, it } from "vitest";
import { iosOAuthClientCreateData } from "./ios-oauth-client";

describe("iOS OAuth client registration", () => {
  it("is a public PKCE client with an HTTPS redirect on the authorization origin and app scopes only", () => {
    const client = iosOAuthClientCreateData("https://auth.example.com/some/path");

    expect(client).toMatchObject({
      clientId: "bisibility-ios",
      public: true,
      redirectUris: ["https://auth.example.com/oauth/ios/callback"],
      requirePKCE: true,
      skipConsent: false,
      tokenEndpointAuthMethod: "none",
    });
    expect(client).not.toHaveProperty("clientSecret");
    expect(client.scopes).toEqual([
      "openid",
      "profile",
      "email",
      "offline_access",
      "api:read",
      "api:write",
    ]);
    for (const scope of ["admin", "read", "write", "tokens:write"]) {
      expect(client.scopes).not.toContain(scope);
    }
  });
});
