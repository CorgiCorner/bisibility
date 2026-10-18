import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authPost: vi.fn(),
  firstRunPending: vi.fn(),
  requestContext: vi.fn(),
  withFirstRunCreation: vi.fn(),
  setAttribute: vi.fn(),
}));

vi.mock("@/lib/observability/request-diagnostics", () => ({
  setRequestDiagnosticAttribute: mocks.setAttribute,
}));
vi.mock("@/lib/auth/auth", () => ({ auth: {} }));
vi.mock("@/lib/auth/first-run", () => ({
  isFirstRunAdministratorPending: mocks.firstRunPending,
}));
vi.mock("@/lib/auth/first-run-context", () => ({
  withFirstRunCreation: mocks.withFirstRunCreation,
}));
vi.mock("@/lib/auth/request-context", () => ({
  auditRequestContextFromHeaders: mocks.requestContext,
}));
vi.mock("better-auth/next-js", () => ({
  toNextJsHandler: () => ({
    GET: vi.fn(),
    POST: mocks.authPost,
  }),
}));

import { POST } from "./route";

const RESOLVED_CLIENT_IP_HEADER = "x-bisibility-resolved-client-ip";

function forwardedRequest(path: string, forwardedFor?: string) {
  return new Request(`https://example.test${path}`, {
    headers: forwardedFor ? { "x-forwarded-for": forwardedFor } : undefined,
    method: "POST",
  });
}

describe("auth route first-run registration context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authPost.mockResolvedValue(new Response(null, { status: 204 }));
    mocks.firstRunPending.mockResolvedValue(true);
    mocks.requestContext.mockReturnValue({ correlationId: "request_1" });
    mocks.withFirstRunCreation.mockImplementation((_context, callback) => callback());
  });

  afterEach(() => {
    delete process.env.BISIBILITY_CLIENT_IP_HEADER;
    delete process.env.BISIBILITY_CLIENT_IP_XFF_DEPTH;
  });

  it("covers only marked wizard email OTP sign-ins with the first-run context", async () => {
    const request = new Request("https://example.test/api/auth/sign-in/email-otp", {
      headers: { "x-bisibility-first-run": "setup" },
      method: "POST",
    });

    await POST(request);

    expect(mocks.requestContext).toHaveBeenCalledWith(request.headers);
    expect(mocks.withFirstRunCreation).toHaveBeenCalledWith(
      { correlationId: "request_1" },
      expect.any(Function),
    );
    expect(mocks.authPost).toHaveBeenCalledOnce();
    expect(mocks.authPost.mock.calls[0]?.[0].url).toBe(request.url);
  });

  it.each(["invalid_grant", "invalid_client", "unsupported_grant_type"])(
    "preserves an OAuth rejection and records only its %s category",
    async (error) => {
      const payload = {
        error,
        error_description: "sensitive fixture",
        client_secret: "fixture-secret",
      };
      const response = Response.json(payload, {
        status: 400,
        headers: { "cache-control": "no-store" },
      });
      mocks.authPost.mockResolvedValue(response);
      const result = await POST(
        new Request("https://example.com/api/auth/oauth2/token", { method: "POST" }),
      );
      expect(result).toBe(response);
      expect(result.status).toBe(400);
      expect(result.headers.get("cache-control")).toBe("no-store");
      expect(await result.json()).toEqual(payload);
      expect(mocks.setAttribute).toHaveBeenCalledExactlyOnceWith("auth.oauth.error", error);
    },
  );

  it.each([
    ["password", {}, { code: "VALIDATION_ERROR" }, "validation_error", undefined],
    [
      "refresh_token",
      { client_id: "fixture-client" },
      { error: "invalid_grant" },
      "invalid_grant",
      undefined,
    ],
    [
      "refresh_token",
      { client_id: "fixture-client", refresh_token: "missing-fixture-token" },
      { error: "invalid_grant" },
      "invalid_grant",
      undefined,
    ],
    [
      "refresh_token",
      {},
      { error: "invalid_client" },
      "invalid_client",
      "Basic bWlzc2luZy1jb2xvbg==",
    ],
  ] as const)(
    "preserves the real %s token endpoint refusal",
    async (grant_type, fields, payload, category, authorization) => {
      const auth = betterAuth({
        baseURL: "https://auth.example.com",
        secret: "test-fixture-secret-".repeat(3),
        rateLimit: { enabled: false },
        plugins: [
          jwt(),
          oauthProvider({
            loginPage: "/login",
            consentPage: "/oauth/consent",
            scopes: ["read"],
            validAudiences: ["https://api.example.com/api/mcp"],
            silenceWarnings: { oauthAuthServerConfig: true, openidConfig: true },
          }),
        ],
      });
      mocks.authPost.mockImplementation((request) => auth.handler(request));
      const response = await POST(
        new Request("https://auth.example.com/api/auth/oauth2/token", {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            ...(authorization ? { authorization } : {}),
          },
          body: new URLSearchParams({ grant_type, ...fields }),
        }),
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject(payload);
      expect(mocks.setAttribute).toHaveBeenCalledExactlyOnceWith("auth.oauth.error", category);
      expect(mocks.firstRunPending).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["/api/auth/oauth2/token", 400, { error: "untrusted arbitrary credential" }, "unclassified"],
    ["/api/auth/oauth2/token", 400, null, "unclassified"],
    ["/api/auth/oauth2/token", 200, { access_token: "fixture-token" }, null],
    ["/api/auth/oauth2/token", 500, { error: "invalid_grant" }, null],
    ["/api/auth/sign-in/email-otp", 400, { error: "invalid_grant" }, null],
  ] as const)(
    "does not expose arbitrary response fields for %s status %s",
    async (path, status, body, category) => {
      const response = Response.json(body, { status });
      mocks.authPost.mockResolvedValue(response);
      const result = await POST(new Request(`https://example.com${path}`, { method: "POST" }));
      expect(result).toBe(response);
      expect(await result.json()).toEqual(body);
      if (category)
        expect(mocks.setAttribute).toHaveBeenCalledExactlyOnceWith("auth.oauth.error", category);
      else expect(mocks.setAttribute).not.toHaveBeenCalled();
    },
  );

  it("preserves the token rejection when optional diagnostics fail", async () => {
    const response = Response.json({ error: "invalid_grant" }, { status: 400 });
    mocks.authPost.mockResolvedValue(response);
    mocks.setAttribute.mockImplementationOnce(() => {
      throw new Error("Diagnostic sink unavailable");
    });
    const result = await POST(
      new Request("https://example.com/api/auth/oauth2/token", { method: "POST" }),
    );
    expect(result).toBe(response);
    expect(await result.json()).toEqual({ error: "invalid_grant" });
  });

  it("preserves unexpected handler errors", async () => {
    const failure = new Error("unexpected transport failure");
    mocks.authPost.mockRejectedValue(failure);
    await expect(
      POST(new Request("https://example.com/api/auth/oauth2/token", { method: "POST" })),
    ).rejects.toBe(failure);
    expect(mocks.setAttribute).not.toHaveBeenCalled();
  });

  it("ignores the wizard marker after an administrator exists", async () => {
    mocks.firstRunPending.mockResolvedValue(false);
    const request = new Request("https://example.test/api/auth/sign-in/email-otp", {
      headers: { "x-bisibility-first-run": "setup" },
      method: "POST",
    });

    await POST(request);

    expect(mocks.withFirstRunCreation).not.toHaveBeenCalled();
    expect(mocks.authPost).toHaveBeenCalledOnce();
    expect(mocks.authPost.mock.calls[0]?.[0].url).toBe(request.url);
  });

  it("leaves ordinary auth requests outside the wizard registration context", async () => {
    const request = new Request("https://example.test/api/auth/sign-in/email-otp", {
      method: "POST",
    });

    await POST(request);

    expect(mocks.withFirstRunCreation).not.toHaveBeenCalled();
    expect(mocks.firstRunPending).not.toHaveBeenCalled();
    expect(mocks.requestContext).not.toHaveBeenCalled();
    expect(mocks.authPost).toHaveBeenCalledOnce();
    expect(mocks.authPost.mock.calls[0]?.[0].url).toBe(request.url);
  });

  it("gives forwarded client addresses independent auth bucket keys", async () => {
    process.env.BISIBILITY_CLIENT_IP_HEADER = "x-forwarded-for";
    const first = forwardedRequest("/api/auth/sign-in/social", "10.0.0.2, 198.51.100.10");
    const second = forwardedRequest("/api/auth/sign-in/social", "10.0.0.2, 198.51.100.11");

    await POST(first);
    await POST(second);

    const firstAuthRequest = mocks.authPost.mock.calls[0]?.[0] as Request;
    const secondAuthRequest = mocks.authPost.mock.calls[1]?.[0] as Request;
    expect(firstAuthRequest.headers.get(RESOLVED_CLIENT_IP_HEADER)).toBe("198.51.100.10");
    expect(secondAuthRequest.headers.get(RESOLVED_CLIENT_IP_HEADER)).toBe("198.51.100.11");
  });

  it("sets no resolved address when no client IP header is configured", async () => {
    const request = forwardedRequest("/api/auth/sign-in/social", "10.0.0.2, 198.51.100.10");

    await POST(request);

    const authRequest = mocks.authPost.mock.calls[0]?.[0] as Request;
    expect(authRequest.headers.get(RESOLVED_CLIENT_IP_HEADER)).toBeNull();
  });

  it("ignores a spoofed forwarded prefix using the trusted chain depth", async () => {
    process.env.BISIBILITY_CLIENT_IP_HEADER = "x-forwarded-for";
    process.env.BISIBILITY_CLIENT_IP_XFF_DEPTH = "2";
    const request = forwardedRequest(
      "/api/auth/sign-in/social",
      "192.0.2.123, 198.51.100.20, 10.0.0.2",
    );

    await POST(request);

    const authRequest = mocks.authPost.mock.calls[0]?.[0] as Request;
    expect(authRequest.headers.get(RESOLVED_CLIENT_IP_HEADER)).toBe("198.51.100.20");
  });
});
