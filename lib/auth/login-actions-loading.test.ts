import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ loadAuth: vi.fn() }));

vi.mock("@/lib/auth/auth", () => {
  mocks.loadAuth();
  return { auth: { api: { sendVerificationOTP: vi.fn() } } };
});
vi.mock("@/lib/api/ratelimit", () => ({ consume: vi.fn() }));
vi.mock("@/lib/deployment/deployment", () => ({ deploymentMode: () => "cloud" }));
vi.mock("@/lib/verification/human-verification", () => ({
  verifyHumanChallenge: async () => ({ code: "verification_failed", success: false }),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

it("does not initialize authentication when importing or rejecting login requests", async () => {
  const { requestLoginCode } = await import("./request-login-code");
  const { resendSignInOtp } = await import("./otp-resend");

  expect(mocks.loadAuth).not.toHaveBeenCalled();
  for (const action of [requestLoginCode, resendSignInOtp]) {
    await expect(action({})).resolves.toMatchObject({ code: "invalid_input", ok: false });
    await expect(action({ email: "person@example.com" })).resolves.toMatchObject({
      code: "verification_failed",
      ok: false,
    });
  }
  expect(mocks.loadAuth).not.toHaveBeenCalled();
});
