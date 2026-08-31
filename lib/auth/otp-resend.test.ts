import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consume: vi.fn(),
  deploymentMode: vi.fn<() => "cloud" | "self-host">(),
  headers: vi.fn(),
  resolveClientIp: vi.fn(),
  sendVerificationOTP: vi.fn(),
  verifyHumanChallenge: vi.fn(),
  withVerifiedLoginCodeRequest: vi.fn(),
}));
vi.mock("@/lib/api/ratelimit", () => ({ consume: mocks.consume }));
vi.mock("@/lib/auth/auth", () => ({
  auth: { api: { sendVerificationOTP: mocks.sendVerificationOTP } },
}));
vi.mock("@/lib/auth/login-code-request-context", () => ({
  withVerifiedLoginCodeRequest: mocks.withVerifiedLoginCodeRequest,
}));
vi.mock("@/lib/deployment/deployment", () => ({ deploymentMode: mocks.deploymentMode }));
vi.mock("@/lib/http/client-ip", () => ({ resolveClientIp: mocks.resolveClientIp }));
vi.mock("@/lib/verification/human-verification", () => ({
  verifyHumanChallenge: mocks.verifyHumanChallenge,
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));

import { resendSignInOtp } from "./otp-resend";

describe("resendSignInOtp verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consume.mockResolvedValue({ resetAt: Date.now() + 60_000, success: true });
    mocks.deploymentMode.mockReturnValue("cloud");
    mocks.headers.mockResolvedValue(new Headers());
    mocks.resolveClientIp.mockReturnValue("198.51.100.7");
    mocks.sendVerificationOTP.mockResolvedValue({ success: true });
    mocks.verifyHumanChallenge.mockResolvedValue({ success: true });
    mocks.withVerifiedLoginCodeRequest.mockImplementation((callback) => callback());
  });

  it("verifies a fresh Cloud token before sending inside the guard context", async () => {
    await expect(
      resendSignInOtp({ email: "person@example.com", verificationToken: "fresh-token" }),
    ).resolves.toEqual({ ok: true, retryAfter: 60 });
    expect(mocks.verifyHumanChallenge).toHaveBeenCalledWith(
      "fresh-token",
      "198.51.100.7",
      expect.any(String),
    );
    expect(mocks.withVerifiedLoginCodeRequest).toHaveBeenCalledOnce();
    expect(mocks.sendVerificationOTP).toHaveBeenCalledOnce();
  });

  it("skips verification and accepts no token in self-host", async () => {
    mocks.deploymentMode.mockReturnValue("self-host");
    await expect(resendSignInOtp({ email: "person@example.com" })).resolves.toEqual({
      ok: true,
      retryAfter: 60,
    });
    expect(mocks.verifyHumanChallenge).not.toHaveBeenCalled();
    expect(mocks.sendVerificationOTP).toHaveBeenCalledOnce();
  });

  it("does not report verification rate limiting as delivery failure", async () => {
    mocks.verifyHumanChallenge.mockResolvedValue({ code: "rate_limited", success: false });
    await expect(
      resendSignInOtp({ email: "person@example.com", verificationToken: "fresh-token" }),
    ).resolves.toEqual({ code: "rate_limited", ok: false, retryAfter: 0 });
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.sendVerificationOTP).not.toHaveBeenCalled();
  });

  it("preserves resend throttle semantics", async () => {
    mocks.consume.mockResolvedValue({ resetAt: Date.now() + 30_000, success: false });
    await expect(
      resendSignInOtp({ email: "person@example.com", verificationToken: "fresh-token" }),
    ).resolves.toMatchObject({ code: "rate_limited", ok: false, retryAfter: expect.any(Number) });
    expect(mocks.sendVerificationOTP).not.toHaveBeenCalled();
  });

  it("preserves an auth API rate limit instead of reporting delivery failure", async () => {
    mocks.sendVerificationOTP.mockRejectedValue({
      body: { code: "TOO_MANY_REQUESTS" },
      status: "TOO_MANY_REQUESTS",
      statusCode: 429,
    });
    await expect(
      resendSignInOtp({ email: "person@example.com", verificationToken: "fresh-token" }),
    ).resolves.toEqual({ code: "rate_limited", ok: false, retryAfter: 0 });
  });

  it("maps capacity separately from delivery failure", async () => {
    mocks.sendVerificationOTP.mockRejectedValue({ body: { code: "capacity_exhausted" } });
    await expect(
      resendSignInOtp({ email: "person@example.com", verificationToken: "fresh-token" }),
    ).resolves.toEqual({ code: "capacity_exhausted", ok: false, retryAfter: 0 });
  });
});
