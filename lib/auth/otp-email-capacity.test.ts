import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reserveEmailSignInCode: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/auth/first-run", () => ({ isFirstRun: vi.fn(async () => false) }));
vi.mock("@/lib/auth/signin-capacity", () => ({
  reserveEmailSignInCode: mocks.reserveEmailSignInCode,
}));
vi.mock("@/lib/email/registry", () => ({
  isEmailConfigured: vi.fn(() => true),
}));
vi.mock("@/lib/email/send", () => ({ sendEmail: mocks.sendEmail }));

import { sendOtpEmail } from "./otp-email";
import { EMAIL_CAPACITY_EXHAUSTED } from "./signin-capacity-types";

describe("cloud sign-in email capacity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reserveEmailSignInCode.mockResolvedValue({
      binding: "daily",
      gated: true,
      granted: true,
    });
  });

  it("marks the sign-in send as already counted after its reservation", async () => {
    await sendOtpEmail(
      { email: "winner@example.com", otp: "111111", type: "sign-in" },
      { fixedOtpEnabled: false },
    );

    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        sendCounterReserved: true,
        to: "winner@example.com",
      }),
    );
  });

  it("rejects before the mailer when no sign-in capacity remains", async () => {
    mocks.reserveEmailSignInCode.mockResolvedValue({
      binding: "monthly",
      gated: true,
      granted: false,
    });

    const error = await sendOtpEmail(
      { email: "loser@example.com", otp: "222222", type: "sign-in" },
      { fixedOtpEnabled: false },
    ).catch((caught) => caught);

    expect(error).toMatchObject({
      body: { code: EMAIL_CAPACITY_EXHAUSTED },
    });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("does not gate other OTP kinds and leaves them for the Resend hook to count", async () => {
    await sendOtpEmail(
      { email: "member@example.com", otp: "333333", type: "email-verification" },
      { fixedOtpEnabled: false },
    );

    expect(mocks.reserveEmailSignInCode).not.toHaveBeenCalled();
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        sendCounterReserved: false,
        to: "member@example.com",
      }),
    );
  });
});
