// @vitest-environment node

import { readOnlyDemoPlugin } from "@/lib/demo/auth-plugin";
import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resendSignInOtp } from "./otp-resend";
import { requestLoginCode } from "./request-login-code";

const mocks = vi.hoisted(() => ({
  owner: vi.fn(),
  sendVerificationOTP: vi.fn(),
}));
vi.mock("@/lib/auth/auth", () => ({
  auth: { api: { sendVerificationOTP: mocks.sendVerificationOTP } },
}));
vi.mock("@/lib/demo/identity", () => ({
  loadEditableDemoOwner: mocks.owner,
  loadEditableDemoViewer: vi.fn(),
  loadDemoIdentity: vi.fn(),
}));
vi.mock("@/lib/deployment/deployment", () => ({ deploymentMode: () => "self-host" }));
vi.mock("@/lib/api/ratelimit", () => ({
  consume: vi.fn(async () => ({ success: true, resetAt: Date.now() + 60_000 })),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ origin: "https://example.com" }),
}));

beforeEach(() => {
  vi.stubEnv("READ_ONLY_DEMO", "0");
  vi.stubEnv("DEMO_MODE", "editable");
  vi.stubEnv("DEMO_USER_ID", "usr_abcdefghijklmnopqrstuvwx");
  vi.stubEnv("DEMO_OWNER_ID", "usr_zyxwvutsrqponmlkjihgfedc");
  vi.stubEnv("DEMO_PROJECT_ID", "prj_abcdefghijklmnopqrstuvwx");
  vi.stubEnv("DEMO_FIXED_OTP", "0");
  vi.stubEnv("ALLOW_INSECURE_FIXED_OTP", "0");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

async function fixture() {
  const deliver = vi.fn();
  const auth = betterAuth({
    baseURL: "https://example.com",
    secret: "test-only-demo-auth-secret-at-least-32-characters",
    plugins: [readOnlyDemoPlugin(), emailOTP({ sendVerificationOTP: deliver })],
    rateLimit: { enabled: false },
  });
  const context = await auth.$context;
  const owner = await context.internalAdapter.createUser({
    email: "owner@example.com",
    name: "Owner",
    emailVerified: true,
  });
  mocks.owner.mockResolvedValue(owner);
  mocks.sendVerificationOTP.mockImplementation(auth.api.sendVerificationOTP);
  return { deliver };
}

describe.each([
  ["request", requestLoginCode],
  ["resend", resendSignInOtp],
] as const)("editable demo %s login action", (_name, action) => {
  it("delivers the owner code through the real authentication hook pipeline", async () => {
    const { deliver } = await fixture();
    await expect(action({ email: "owner@example.com" })).resolves.toMatchObject({ ok: true });
    expect(deliver).toHaveBeenCalledOnce();
    expect(deliver).toHaveBeenCalledWith(
      expect.objectContaining({ email: "owner@example.com", type: "sign-in" }),
      expect.anything(),
    );
  });

  it("does not send to an address other than the current owner", async () => {
    const { deliver } = await fixture();
    await action({ email: "other@example.com" });
    expect(deliver).not.toHaveBeenCalled();
  });
});
