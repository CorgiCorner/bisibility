import { createHash } from "node:crypto";
import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getClient: vi.fn(), getPolicy: vi.fn() }));
vi.mock("@/lib/queries/oauth-consent", () => ({
  getOAuthConsentClient: mocks.getClient,
  getOAuthClientScopePolicy: mocks.getPolicy,
}));

import { oauthConsentGuard } from "./oauth-consent-guard";

const origin = "https://auth.example.com";
const redirectUri = "https://callback.example.com/return";
const resource = "https://api.example.com/api/mcp";
const verifier = "a".repeat(64);

function testAuth() {
  return betterAuth({
    baseURL: origin,
    secret: "test-secret-at-least-32-characters-long",
    emailAndPassword: { enabled: true },
    rateLimit: { enabled: false },
    plugins: [
      jwt(),
      oauthProvider({
        loginPage: "/login",
        consentPage: "/oauth/consent",
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        scopes: ["openid", "read", "write", "admin", "tokens:write"],
        validAudiences: [resource],
        silenceWarnings: { oauthAuthServerConfig: true, openidConfig: true },
      }),
      oauthConsentGuard(),
    ],
  });
}
function post(auth: ReturnType<typeof testAuth>, path: string, body: unknown, cookie = "") {
  return auth.handler(
    new Request(`${origin}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, cookie },
      body: JSON.stringify(body),
    }),
  );
}

describe("OAuth consent POST scope enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(["ChatGPT", "Custom"])(
    "stores only permitted scopes when %s submits a forged broader POST",
    async (name) => {
      const auth = testAuth();
      const registered = await post(auth, "/oauth2/register", {
        client_name: name,
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      });
      expect(registered.status).toBe(200);
      const client = (await registered.json()) as { client_id: string };
      mocks.getPolicy.mockResolvedValue({ name, redirectUris: [redirectUri] });
      mocks.getClient.mockResolvedValue({
        dynamic: true,
        id: client.client_id,
        name,
        redirectUri: "callback.example.com/return",
      });
      const signedIn = await post(auth, "/sign-up/email", {
        email: "owner@example.com",
        name: "Owner",
        password: "Password-for-tests-123!",
      });
      expect(signedIn.status).toBe(200);
      const cookie = signedIn.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .join("; ");
      const query = new URLSearchParams({
        client_id: client.client_id,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "openid read write admin tokens:write",
        resource,
        code_challenge: createHash("sha256").update(verifier).digest("base64url"),
        code_challenge_method: "S256",
      });
      const authorization = await auth.handler(
        new Request(`${origin}/api/auth/oauth2/authorize?${query}`, { headers: { cookie } }),
      );
      expect(authorization.status).toBe(302);
      const consentUrl = new URL(authorization.headers.get("location") as string, origin);
      expect(consentUrl.pathname).toBe("/oauth/consent");
      const consent = await post(
        auth,
        "/oauth2/consent",
        {
          accept: true,
          scope: "openid read write admin tokens:write",
          oauth_query: consentUrl.search.slice(1),
        },
        cookie,
      );
      expect(consent.status).toBe(200);
      const adapter = (await auth.$context).adapter;
      const saved = await adapter.findOne<{ scopes: string[] }>({
        model: "oauthConsent",
        where: [{ field: "clientId", value: client.client_id }],
      });
      expect(saved?.scopes).toEqual(
        name === "ChatGPT"
          ? ["openid", "read"]
          : ["openid", "read", "write", "admin", "tokens:write"],
      );
    },
  );

  it("keeps provider signature validation before the consent guard", async () => {
    const response = await post(testAuth(), "/oauth2/consent", {
      accept: true,
      scope: "read",
      oauth_query: "client_id=registered-client&scope=read&sig=forged",
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_signature" });
    expect(mocks.getClient).not.toHaveBeenCalled();
  });
});
