import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACCOUNT_ACCESS_EMAIL_PURPOSES, emailNotificationsDisabled } from "./notification-policy";
import { sendEmail } from "./send";

const NOTIFICATION_EMAIL_PURPOSES = [
  "weekly-digest",
  "alert",
  "alert-digest",
  "achievement",
  "welcome",
  "founder-followup",
  "domain-verification-lost",
  "usage-warning",
  "billing-confirmation",
  "access-claim-reminder",
  "retention-notice",
  "roadmap-confirmation",
  "roadmap-availability",
  "roadmap-feedback",
  "waitlist-notice",
  "email-changed-notice",
  "instance-mail-test",
  "notification",
] as const;

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  refresh: vi.fn(),
  budget: vi.fn(),
  suppression: vi.fn(),
  receipt: vi.fn(),
  resolve: vi.fn(),
}));
vi.mock("./registry", () => ({ resolveEmailProvider: mocks.resolve }));
vi.mock("./instance-mail-store", () => ({ refreshInstanceMailRuntime: mocks.refresh }));
vi.mock("./budget", () => ({ reserveEmailDailyBudget: mocks.budget }));
vi.mock("./provider-feedback-store", () => ({
  assertMailNotSuppressed: mocks.suppression,
  recordMailReceipt: mocks.receipt,
}));
const input = {
  category: "transactional" as const,
  from: "sender@example.org",
  html: "x",
  text: "x",
  subject: "test",
  to: "owner@example.org",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("EMAIL_NOTIFICATIONS_DISABLED", "1");
  vi.stubEnv("DEMO_MODE", "");
  vi.stubEnv("READ_ONLY_DEMO", "0");
  mocks.budget.mockResolvedValue({ granted: true });
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it.each(["1", "true", " yes ", "ON"])("uses the existing truthy parser for %s", (value) => {
  vi.stubEnv("EMAIL_NOTIFICATIONS_DISABLED", value);
  expect(emailNotificationsDisabled()).toBe(true);
});
it.each([undefined, "", "0", "false", "off"])("leaves normal delivery enabled for %s", (value) => {
  vi.stubEnv("EMAIL_NOTIFICATIONS_DISABLED", value);
  expect(emailNotificationsDisabled()).toBe(false);
});
for (const provider of ["ses", "smtp", "resend"])
  describe(provider, () => {
    beforeEach(() =>
      mocks.resolve.mockReturnValue({ id: provider, isConfigured: () => true, send: mocks.send }),
    );
    for (const category of ["bulk", "transactional"] as const)
      it.each(NOTIFICATION_EMAIL_PURPOSES)(
        `quietly skips %s (${category}) before all transport side effects`,
        async (purpose) => {
          const claim = vi.fn();
          const before = vi.fn();
          expect(
            await sendEmail({
              ...input,
              purpose,
              category,
              claimProviderSend: claim,
              beforeProviderSend: before,
            }),
          ).toBe(false);
          for (const mock of Object.values(mocks)) expect(mock).not.toHaveBeenCalled();
          expect(claim).not.toHaveBeenCalled();
          expect(before).not.toHaveBeenCalled();
          expect(console.info).toHaveBeenCalledExactlyOnceWith(
            `[email] skipped purpose=${purpose}: notifications disabled`,
          );
          expect(String(vi.mocked(console.info).mock.calls)).not.toContain(input.to);
        },
      );
    it.each(ACCOUNT_ACCESS_EMAIL_PURPOSES)("still sends %s", async (purpose) => {
      await sendEmail({ ...input, purpose });
      expect(mocks.send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ to: input.to }));
      expect(mocks.budget).toHaveBeenCalledExactlyOnceWith("transactional");
      expect(console.info).not.toHaveBeenCalled();
    });
    it("fails closed for omitted and unknown purposes and ignores pre-reserved flags", async () => {
      expect(
        await sendEmail({ ...input, dailyBudgetReserved: true, sendCounterReserved: true }),
      ).toBe(false);
      expect(await sendEmail({ ...input, purpose: "future-notice" as never })).toBe(false);
      expect(mocks.send).not.toHaveBeenCalled();
      expect(mocks.budget).not.toHaveBeenCalled();
    });
    it("preserves normal notification delivery when the flag is off", async () => {
      vi.stubEnv("EMAIL_NOTIFICATIONS_DISABLED", "0");
      await sendEmail({ ...input, purpose: "weekly-digest" });
      expect(mocks.send).toHaveBeenCalledOnce();
    });
  });
