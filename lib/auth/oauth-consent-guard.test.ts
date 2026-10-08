import { beforeEach, describe, expect, it, vi } from "vitest";
import { READ_ONLY_OAUTH_CALLBACK_HOSTS } from "./oauth-consent-copy";

const mocks = vi.hoisted(() => ({ getClient: vi.fn(), getPolicy: vi.fn() }));
vi.mock("@/lib/queries/oauth-consent", () => ({
  getOAuthConsentClient: mocks.getClient,
  getOAuthClientScopePolicy: mocks.getPolicy,
}));

import { allowedOAuthTokenScopes, oauthConsentGuard } from "./oauth-consent-guard";

const plugin = oauthConsentGuard();
const handler = plugin.hooks?.before?.[0]?.handler;
const query = new URLSearchParams({
  client_id: "registered-client",
  redirect_uri: "https://callback.example.com/return",
  scope: "openid read write admin tokens:write",
  sig: "provider-signed-query",
}).toString();

function context(scope?: string) {
  return {
    path: "/oauth2/consent",
    body: { accept: true, oauth_query: query, ...(scope === undefined ? {} : { scope }) },
  };
}

describe("OAuth consent scope guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPolicy.mockResolvedValue({
      name: "Custom",
      redirectUris: ["https://callback.example.com/return"],
    });
    mocks.getClient.mockResolvedValue({
      dynamic: true,
      id: "registered-client",
      name: "ChatGPT",
      redirectUri: "callback.example.com/return",
    });
  });

  it.each([undefined, "openid read write admin tokens:write"])(
    "narrows a forged broader consent POST with scope %s",
    async (scope) => {
      const request = context(scope);
      await handler?.(request as never);
      expect(request.body).toMatchObject({ oauth_query: query, scope: "openid read" });
      expect(mocks.getClient).toHaveBeenCalledWith(
        "registered-client",
        "https://callback.example.com/return",
      );
    },
  );

  it("preserves other registered clients without changing the signed authorization query", async () => {
    mocks.getClient.mockResolvedValue({
      dynamic: true,
      id: "registered-client",
      name: "Custom",
      redirectUri: "callback.example.com/return",
    });
    const request = context("read write");
    await handler?.(request as never);
    expect(request.body).toMatchObject({ oauth_query: query, scope: "read write" });
  });

  it("does not add read when the accepted scope only requested write", async () => {
    const request = context("write");
    await handler?.(request as never);
    expect(request.body).toMatchObject({ scope: "" });
  });

  it("leaves incomplete or denied requests to the provider's existing validation", async () => {
    for (const body of [
      { accept: false, oauth_query: query },
      { accept: true },
      { accept: true, oauth_query: "scope=read" },
    ]) {
      await handler?.({ path: "/oauth2/consent", body } as never);
    }
    expect(mocks.getClient).not.toHaveBeenCalled();
    expect(plugin.hooks?.before?.[0]?.matcher({ path: "/oauth2/authorize" } as never)).toBe(false);
  });

  it("considers every registered callback for existing and refreshed tokens", async () => {
    mocks.getPolicy.mockResolvedValue({
      name: "Custom",
      redirectUris: [
        "https://callback.example.com/return",
        `https://${READ_ONLY_OAUTH_CALLBACK_HOSTS[0]}/callback`,
      ],
    });
    await expect(
      allowedOAuthTokenScopes("registered-client", ["read", "admin", "tokens:write"]),
    ).resolves.toEqual(["read"]);
  });

  it("applies the all-callback ceiling to consent when the chosen callback has another host", async () => {
    mocks.getClient.mockResolvedValue({
      dynamic: true,
      id: "registered-client",
      name: "Custom",
      redirectUri: "callback.example.com/return",
    });
    mocks.getPolicy.mockResolvedValue({
      name: "Custom",
      redirectUris: [
        "https://callback.example.com/return",
        `https://${READ_ONLY_OAUTH_CALLBACK_HOSTS[0]}/callback`,
      ],
    });
    const request = context("read write admin");
    await handler?.(request as never);
    expect(request.body).toMatchObject({ scope: "read" });
  });

  it("keeps broad scopes for another registered client", async () => {
    mocks.getPolicy.mockResolvedValue({
      name: "Custom",
      redirectUris: ["[", "https://callback.example.com/return"],
    });
    await expect(allowedOAuthTokenScopes("registered-client", ["read", "admin"])).resolves.toEqual([
      "read",
      "admin",
    ]);
  });

  it("only retains explicit read scopes for unknown clients or missing signed client claims", async () => {
    mocks.getPolicy.mockResolvedValue(null);
    await expect(allowedOAuthTokenScopes("missing", ["read", "write"])).resolves.toEqual(["read"]);
    await expect(allowedOAuthTokenScopes(null, ["admin"])).resolves.toEqual([]);
  });
});
