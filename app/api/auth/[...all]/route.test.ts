import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authPost: vi.fn(),
  firstRunPending: vi.fn(),
  requestContext: vi.fn(),
  withFirstRunCreation: vi.fn(),
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
