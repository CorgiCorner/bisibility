import { deliverInvite } from "@/lib/actions/team-invite-delivery";
import { sendOtpEmail } from "@/lib/auth/otp-email";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ send: vi.fn(), budget: vi.fn() }));
vi.mock("@/lib/auth/test-auth-extension", () => ({
  suppressTestAuthEmail: () => false,
  suppressReviewLoginEmail: () => false,
}));
vi.mock("./registry", () => ({
  isEmailConfigured: () => true,
  resolveEmailProvider: () => ({ id: "ses", isConfigured: () => true, send: mocks.send }),
}));
vi.mock("./instance-mail-store", () => ({ refreshInstanceMailRuntime: vi.fn() }));
vi.mock("./budget", () => ({ reserveEmailDailyBudget: mocks.budget }));
vi.mock("./provider-feedback-store", () => ({
  assertMailNotSuppressed: vi.fn(),
  recordMailReceipt: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("EMAIL_NOTIFICATIONS_DISABLED", "1");
  vi.stubEnv("EMAIL_FROM", "sender@example.org");
  vi.stubEnv("SITE_URL", "https://demo.example.org");
  vi.stubEnv("DEMO_MODE", "");
  vi.stubEnv("READ_ONLY_DEMO", "0");
  mocks.budget.mockResolvedValue({ granted: true });
});
afterEach(() => vi.unstubAllEnvs());
it.each(["sign-in", "email-verification", "forget-password", "change-email"] as const)(
  "preserves the real %s OTP sender with notifications disabled",
  async (type) => {
    await sendOtpEmail({ email: "person@example.org", otp: "123456", type });
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ to: "person@example.org" }),
    );
  },
);
it("preserves a member-triggered invitation with notifications disabled", async () => {
  await deliverInvite(
    {
      id: "invite",
      email: "invited@example.org",
      expiresAt: new Date("2026-12-01Z"),
      invitedBy: { name: "Member", email: "member@example.org" },
      project: { name: "Project" },
      role: "viewer",
    },
    "invite-token",
  );
  expect(mocks.send).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ to: "invited@example.org" }),
  );
});
