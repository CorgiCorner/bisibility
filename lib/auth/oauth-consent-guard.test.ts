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

function context(scope?: string, choice: Record<string, unknown> = {}) {
  return {
    path: "/oauth2/consent",
    body: {
      accept: true,
      oauth_query: query,
      ...(scope === undefined ? {} : { scope }),
      ...choice,
    },
  };
}

function customClient() {
  mocks.getClient.mockResolvedValue({
    dynamic: true,
    id: "registered-client",
    name: "Custom",
    redirectUri: "callback.example.com/return",
  });
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

  it("keeps api scopes for the first-party app only and caps the app to its fixed scopes", async () => {
    mocks.getPolicy.mockResolvedValue({ name: "Custom", redirectUris: [] });
    await expect(
      allowedOAuthTokenScopes("registered-client", ["openid", "read", "api:read", "api:write"]),
    ).resolves.toEqual(["openid", "read"]);
    await expect(
      allowedOAuthTokenScopes("bisibility-ios", [
        "openid",
        "offline_access",
        "api:read",
        "api:write",
        "read",
        "admin",
        "tokens:write",
      ]),
    ).resolves.toEqual(["openid", "offline_access", "api:read", "api:write"]);
  });

  it("defaults a registered client to read and write without API tokens", async () => {
    customClient();
    const request = context();
    await handler?.(request as never);
    expect(request.body).toMatchObject({ scope: "openid read write" });
  });

  it("narrows a crafted full scope list to the default read and write grant", async () => {
    customClient();
    const request = context("openid read write admin tokens:write evil api:write");
    await handler?.(request as never);
    expect(request.body).toMatchObject({ scope: "openid read write" });
  });

  it("grants read only when that level is selected", async () => {
    customClient();
    const request = context("openid read write admin tokens:write", { access_level: "read" });
    await handler?.(request as never);
    expect(request.body).toMatchObject({ scope: "openid read" });
  });

  it("grants admin for full access while the token checkbox stays off", async () => {
    customClient();
    const request = context("openid read write admin tokens:write", { access_level: "full" });
    await handler?.(request as never);
    expect(request.body).toMatchObject({ scope: "openid read write admin" });
  });

  it("grants tokens:write only when the checkbox is on", async () => {
    customClient();
    const request = context("openid read write admin tokens:write", { allow_api_tokens: true });
    await handler?.(request as never);
    expect(request.body).toMatchObject({ scope: "openid read write tokens:write" });
  });

  it("grants full access and API tokens together", async () => {
    customClient();
    const request = context("openid read write admin tokens:write", {
      access_level: "full",
      allow_api_tokens: true,
    });
    await handler?.(request as never);
    expect(request.body).toMatchObject({ scope: "openid read write admin tokens:write" });
  });

  it("keeps ChatGPT read-only when the POST asks for full access and tokens", async () => {
    const request = context("openid read write admin tokens:write", {
      access_level: "full",
      allow_api_tokens: true,
    });
    await handler?.(request as never);
    expect(request.body).toMatchObject({ scope: "openid read" });
  });

  it("does not widen past the signed authorization request", async () => {
    customClient();
    const signed = new URLSearchParams({
      client_id: "registered-client",
      redirect_uri: "https://callback.example.com/return",
      scope: "openid read",
      sig: "provider-signed-query",
    }).toString();
    const request = {
      path: "/oauth2/consent",
      body: {
        accept: true,
        access_level: "full",
        allow_api_tokens: true,
        oauth_query: signed,
        scope: "openid read write admin tokens:write",
      },
    };
    await handler?.(request as never);
    expect(request.body).toMatchObject({ scope: "openid read" });
  });

  it("treats a non-boolean token flag as unchecked", async () => {
    customClient();
    const request = context("openid read write tokens:write", { allow_api_tokens: "true" });
    await handler?.(request as never);
    expect(request.body).toMatchObject({ scope: "openid read write" });
  });

  it("grants a static CLI client the requested admin and token scopes", async () => {
    mocks.getClient.mockResolvedValue({
      dynamic: false,
      id: "bisibility-cli",
      name: "Bisibility CLI",
      redirectUri: "callback.example.com/return",
    });
    const oauthQuery = new URLSearchParams({
      client_id: "bisibility-cli",
      redirect_uri: "https://callback.example.com/return",
      scope: "openid read write admin tokens:write",
      sig: "provider-signed-query",
    }).toString();
    const request = {
      path: "/oauth2/consent",
      body: {
        accept: true,
        oauth_query: oauthQuery,
        scope: "openid read write admin tokens:write",
      },
    };
    await handler?.(request as never);
    expect(request.body).toMatchObject({ scope: "openid read write admin tokens:write" });
  });

  it("does not widen a static client past the signed request", async () => {
    mocks.getClient.mockResolvedValue({
      dynamic: false,
      id: "bisibility-cli",
      name: "Bisibility CLI",
      redirectUri: "callback.example.com/return",
    });
    const oauthQuery = new URLSearchParams({
      client_id: "bisibility-cli",
      redirect_uri: "https://callback.example.com/return",
      scope: "openid read",
      sig: "provider-signed-query",
    }).toString();
    const request = {
      path: "/oauth2/consent",
      body: {
        accept: true,
        access_level: "full",
        allow_api_tokens: true,
        oauth_query: oauthQuery,
        scope: "openid read write admin tokens:write",
      },
    };
    await handler?.(request as never);
    expect(request.body).toMatchObject({ scope: "openid read" });
  });
});
