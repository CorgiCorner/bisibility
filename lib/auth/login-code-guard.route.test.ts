import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deploymentMode: vi.fn<() => "cloud" | "self-host">(),
  firstRun: vi.fn(),
  isEmailConfigured: vi.fn(),
  isVerifiedLoginCodeRequest: vi.fn(),
  reserveEmailSignInCode: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/auth/first-run", () => ({ isFirstRun: mocks.firstRun }));
vi.mock("@/lib/auth/login-code-request-context", () => ({
  isVerifiedLoginCodeRequest: mocks.isVerifiedLoginCodeRequest,
}));
vi.mock("@/lib/auth/signin-capacity", () => ({
  reserveEmailSignInCode: mocks.reserveEmailSignInCode,
}));
vi.mock("@/lib/deployment/deployment", () => ({ deploymentMode: mocks.deploymentMode }));
vi.mock("@/lib/email/registry", () => ({ isEmailConfigured: mocks.isEmailConfigured }));
vi.mock("@/lib/email/send", () => ({ sendEmail: mocks.sendEmail }));

import { loginCodeGuardPlugin, withOtpEmailRequest } from "./login-code-guard";
import { sendOtpEmail } from "./otp-email";
import { EMAIL_CAPACITY_EXHAUSTED } from "./signin-capacity-types";

function createTestAuth() {
  return betterAuth({
    baseURL: "https://example.com",
    rateLimit: { enabled: false },
    secret: "test-secret-at-least-32-characters-long",
    plugins: [
      emailOTP({
        async sendVerificationOTP(data, context) {
          await withOtpEmailRequest(context?.context, () => sendOtpEmail(data));
        },
      }),
      loginCodeGuardPlugin({ fixedOtpEnabled: false }),
    ],
  });
}

function sendRequest(auth: ReturnType<typeof createTestAuth>, email: string, type = "sign-in") {
  return auth.handler(
    new Request("https://example.com/api/auth/email-otp/send-verification-otp", {
      body: JSON.stringify({ email, type }),
      headers: { "content-type": "application/json", origin: "https://example.com" },
      method: "POST",
    }),
  );
}

async function responseCode(response: Response) {
  return (await response.json()) as { code?: string; message?: string; success?: boolean };
}

describe("email OTP send route guard", () => {
  beforeEach(() => {
    mocks.deploymentMode.mockReturnValue("self-host");
    mocks.firstRun.mockResolvedValue(false);
    mocks.isEmailConfigured.mockReturnValue(true);
    mocks.isVerifiedLoginCodeRequest.mockReturnValue(false);
    mocks.reserveEmailSignInCode.mockResolvedValue({ gated: true, granted: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns EMAIL_NOT_CONFIGURED after first run in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.isEmailConfigured.mockReturnValue(false);

    const response = await sendRequest(createTestAuth(), "owner@example.com");

    expect(response.status).toBe(503);
    await expect(responseCode(response)).resolves.toMatchObject({
      code: "EMAIL_NOT_CONFIGURED",
      message: "Email delivery is not configured on this instance.",
    });
    expect(mocks.reserveEmailSignInCode).not.toHaveBeenCalled();
  });

  it("returns EMAIL_CAPACITY_EXHAUSTED before invoking the sender", async () => {
    mocks.reserveEmailSignInCode.mockResolvedValue({ gated: true, granted: false });

    const response = await sendRequest(createTestAuth(), "full@example.com");

    expect(response.status).toBe(429);
    await expect(responseCode(response)).resolves.toMatchObject({
      code: EMAIL_CAPACITY_EXHAUSTED,
    });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("carries the granted reservation into the send callback", async () => {
    const response = await sendRequest(createTestAuth(), "ready@example.com");

    expect(response.status).toBe(200);
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ sendCounterReserved: true, to: "ready@example.com" }),
    );
  });

  it("bypasses reservation and logs the setup code on first run", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.stubEnv("NODE_ENV", "production");
    mocks.firstRun.mockResolvedValue(true);
    mocks.isEmailConfigured.mockReturnValue(false);

    const response = await sendRequest(createTestAuth(), "setup@example.com");

    expect(response.status).toBe(200);
    expect(mocks.reserveEmailSignInCode).not.toHaveBeenCalled();
    expect(info).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/^\[auth\] sign-in OTP for setup@example\.com: \d{6}$/),
    );
    expect(info).toHaveBeenNthCalledWith(
      2,
      "Configure EMAIL_PROVIDER (resend, ses, smtp) to receive future sign-in codes by email.",
    );
  });

  it("leaves non-sign-in OTP requests outside the sign-in gate", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.isEmailConfigured.mockReturnValue(false);

    const response = await sendRequest(
      createTestAuth(),
      "verification@example.com",
      "email-verification",
    );

    expect(response.status).toBe(200);
    expect(mocks.firstRun).not.toHaveBeenCalled();
    expect(mocks.reserveEmailSignInCode).not.toHaveBeenCalled();
  });

  it("isolates reservation markers across concurrent requests", async () => {
    let releaseFirst: (() => void) | undefined;
    const firstReservation = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    mocks.reserveEmailSignInCode
      .mockImplementationOnce(async () => {
        await firstReservation;
        return { gated: true, granted: true };
      })
      .mockResolvedValueOnce({ gated: false, granted: true });

    const auth = createTestAuth();
    const first = sendRequest(auth, "first@example.com");
    await vi.waitFor(() => expect(mocks.reserveEmailSignInCode).toHaveBeenCalledTimes(1));
    const second = sendRequest(auth, "second@example.com");
    await vi.waitFor(() => expect(mocks.sendEmail).toHaveBeenCalledTimes(1));
    releaseFirst?.();
    await Promise.all([first, second]);

    const reservations = new Map(
      mocks.sendEmail.mock.calls.map(([message]) => [message.to, message.sendCounterReserved]),
    );
    expect(reservations).toEqual(
      new Map([
        ["first@example.com", true],
        ["second@example.com", false],
      ]),
    );
  });
});
