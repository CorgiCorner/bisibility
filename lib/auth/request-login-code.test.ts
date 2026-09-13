import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deploymentMode: vi.fn<() => "cloud" | "self-host">(),
  headers: vi.fn(),
  resolveClientIp: vi.fn(),
  sendVerificationOTP: vi.fn(),
  verifyHumanChallenge: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/auth/auth", () => ({
  auth: { api: { sendVerificationOTP: mocks.sendVerificationOTP } },
}));
vi.mock("@/lib/deployment/deployment", () => ({ deploymentMode: mocks.deploymentMode }));
vi.mock("@/lib/http/client-ip", () => ({ resolveClientIp: mocks.resolveClientIp }));
vi.mock("@/lib/verification/human-verification", () => ({
  verifyHumanChallenge: mocks.verifyHumanChallenge,
}));

import { requestLoginCode } from "./request-login-code";

describe("requestLoginCode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deploymentMode.mockReturnValue("cloud");
    mocks.headers.mockResolvedValue(new Headers());
    mocks.resolveClientIp.mockReturnValue("198.51.100.7");
    mocks.verifyHumanChallenge.mockResolvedValue({ success: true });
    mocks.sendVerificationOTP.mockResolvedValue({ success: true });
  });

  it("verifies the Cloud token before sending a sign-in code", async () => {
    await expect(
      requestLoginCode({
        email: " PERSON@EXAMPLE.COM ",
        verificationToken: "verification-token-123",
      }),
    ).resolves.toEqual({ ok: true });
    expect(mocks.verifyHumanChallenge).toHaveBeenCalledWith(
      "verification-token-123",
      "198.51.100.7",
      expect.any(String),
    );
    expect(mocks.sendVerificationOTP).toHaveBeenCalledWith({
      body: { email: "person@example.com", type: "sign-in" },
      headers: expect.any(Headers),
      method: "POST",
    });
    expect(mocks.verifyHumanChallenge.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.sendVerificationOTP.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it.each(["verification_failed", "rate_limited"] as const)(
    "returns %s without sending when verification fails",
    async (code) => {
      mocks.verifyHumanChallenge.mockResolvedValue({ code, success: false });
      await expect(
        requestLoginCode({ email: "person@example.com", verificationToken: "invalid-token" }),
      ).resolves.toEqual({ code, ok: false });
      expect(mocks.sendVerificationOTP).not.toHaveBeenCalled();
    },
  );

  it("fails closed when the verifier is unavailable", async () => {
    mocks.verifyHumanChallenge.mockRejectedValue(new Error("verification service unavailable"));

    await expect(
      requestLoginCode({ email: "person@example.com", verificationToken: "token" }),
    ).resolves.toEqual({ code: "verification_failed", ok: false });
    expect(mocks.sendVerificationOTP).not.toHaveBeenCalled();
  });

  it("skips verification and accepts no token for self-host", async () => {
    mocks.deploymentMode.mockReturnValue("self-host");
    await expect(requestLoginCode({ email: "person@example.com" })).resolves.toEqual({ ok: true });
    expect(mocks.verifyHumanChallenge).not.toHaveBeenCalled();
    expect(mocks.sendVerificationOTP).toHaveBeenCalledOnce();
  });

  it("preserves the missing-mailer code for direct request defense", async () => {
    mocks.sendVerificationOTP.mockRejectedValue({
      body: { code: "EMAIL_NOT_CONFIGURED" },
    });

    await expect(
      requestLoginCode({ email: "person@example.com", verificationToken: "token" }),
    ).resolves.toEqual({ code: "EMAIL_NOT_CONFIGURED", ok: false });
  });

  it("preserves auth rate limiting instead of reporting delivery failure", async () => {
    mocks.sendVerificationOTP.mockRejectedValue({
      body: { code: "TOO_MANY_REQUESTS" },
      status: "TOO_MANY_REQUESTS",
      statusCode: 429,
    });

    await expect(
      requestLoginCode({ email: "person@example.com", verificationToken: "token" }),
    ).resolves.toEqual({ code: "rate_limited", ok: false });
  });

  it("validates the shared schema before verification or email delivery", async () => {
    await expect(
      requestLoginCode({ email: "not-an-email", verificationToken: "token" }),
    ).resolves.toEqual({ code: "invalid_input", ok: false });
    expect(mocks.verifyHumanChallenge).not.toHaveBeenCalled();
    expect(mocks.sendVerificationOTP).not.toHaveBeenCalled();
  });
});
