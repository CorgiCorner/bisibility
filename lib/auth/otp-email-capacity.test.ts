import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
}));
vi.mock("@/lib/email/registry", () => ({
  isEmailConfigured: vi.fn(() => true),
}));
vi.mock("@/lib/email/send", () => ({ sendEmail: mocks.sendEmail }));

import { sendOtpEmail } from "./otp-email";
import { withOtpSendState } from "./otp-send-context";

describe("cloud sign-in email capacity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks the sign-in send as already counted after its reservation", async () => {
    await withOtpSendState({ firstRunFallback: false, sendCounterReserved: true }, () =>
      sendOtpEmail({ email: "winner@example.com", otp: "111111", type: "sign-in" }),
    );

    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        sendCounterReserved: true,
        to: "winner@example.com",
      }),
    );
  });

  it("does not gate other OTP kinds and leaves them for the Resend hook to count", async () => {
    await sendOtpEmail({
      email: "member@example.com",
      otp: "333333",
      type: "email-verification",
    });

    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        sendCounterReserved: false,
        to: "member@example.com",
      }),
    );
  });
});
