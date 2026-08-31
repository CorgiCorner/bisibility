import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deploymentMode: vi.fn<() => "cloud" | "self-host">(),
  firstRun: vi.fn(),
  isEmailConfigured: vi.fn(),
  isVerifiedLoginCodeRequest: vi.fn(),
  reserveEmailSignInCode: vi.fn(),
}));
vi.mock("@/lib/auth/first-run", () => ({ isFirstRun: mocks.firstRun }));
vi.mock("@/lib/auth/signin-capacity", () => ({
  reserveEmailSignInCode: mocks.reserveEmailSignInCode,
}));
vi.mock("@/lib/deployment/deployment", () => ({ deploymentMode: mocks.deploymentMode }));
vi.mock("@/lib/email/registry", () => ({ isEmailConfigured: mocks.isEmailConfigured }));
vi.mock("@/lib/auth/login-code-request-context", () => ({
  isVerifiedLoginCodeRequest: mocks.isVerifiedLoginCodeRequest,
}));

import { loginCodeGuardPlugin } from "./login-code-guard";

const handler = loginCodeGuardPlugin().hooks?.before?.[0]?.handler;

function context(path: string) {
  return { body: { type: "sign-in" }, path } as never;
}

describe("loginCodeGuardPlugin", () => {
  beforeEach(() => {
    mocks.deploymentMode.mockReturnValue("cloud");
    mocks.firstRun.mockResolvedValue(false);
    mocks.isEmailConfigured.mockReturnValue(true);
    mocks.isVerifiedLoginCodeRequest.mockReturnValue(false);
    mocks.reserveEmailSignInCode.mockResolvedValue({ gated: true, granted: true });
  });

  it("rejects direct Cloud sign-in code requests", async () => {
    await expect(handler?.(context("/email-otp/send-verification-otp"))).rejects.toMatchObject({
      body: { code: "HUMAN_VERIFICATION_REQUIRED" },
    });
  });

  it("allows a Cloud sign-in code from the verified action context", async () => {
    mocks.isVerifiedLoginCodeRequest.mockReturnValue(true);
    await expect(handler?.(context("/email-otp/send-verification-otp"))).resolves.toBeUndefined();
  });

  it("does not gate self-host requests", async () => {
    mocks.deploymentMode.mockReturnValue("self-host");
    await expect(handler?.(context("/email-otp/send-verification-otp"))).resolves.toBeUndefined();
  });

  it("does not gate non-sign-in OTP requests", async () => {
    await expect(
      handler?.({
        body: { type: "email-verification" },
        path: "/email-otp/send-verification-otp",
      } as never),
    ).resolves.toBeUndefined();
  });
});
