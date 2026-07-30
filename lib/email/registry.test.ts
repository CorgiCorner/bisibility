import { afterEach, describe, expect, it, vi } from "vitest";
import { resendEmailProvider } from "./providers/resend";
import { sesEmailProvider } from "./providers/ses";
import { smtpEmailProvider } from "./providers/smtp";
import { isEmailConfigured, resolveEmailProvider } from "./registry";

function clearEmailEnv() {
  vi.stubEnv("EMAIL_PROVIDER", "");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("SES_REGION", "");
  vi.stubEnv("SMTP_URL", "");
  vi.stubEnv("AWS_REGION", "");
  vi.stubEnv("AWS_DEFAULT_REGION", "");
}

describe("email provider registry", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolves an explicitly selected provider", () => {
    clearEmailEnv();
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    expect(resolveEmailProvider()).toBe(resendEmailProvider);

    vi.stubEnv("EMAIL_PROVIDER", "ses");
    expect(resolveEmailProvider()).toBe(sesEmailProvider);

    vi.stubEnv("EMAIL_PROVIDER", "smtp");
    expect(resolveEmailProvider()).toBe(smtpEmailProvider);
  });

  it("accepts provider ids case- and whitespace-insensitively", () => {
    clearEmailEnv();
    vi.stubEnv("EMAIL_PROVIDER", " SES ");
    expect(resolveEmailProvider()).toBe(sesEmailProvider);
  });

  it("resolves to no provider when EMAIL_PROVIDER is unset", () => {
    clearEmailEnv();
    expect(resolveEmailProvider()).toBeNull();
  });

  it("never resolves a provider from credentials alone", () => {
    clearEmailEnv();
    vi.stubEnv("RESEND_API_KEY", "email-key");
    expect(resolveEmailProvider()).toBeNull();

    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("AWS_REGION", "eu-central-1");
    expect(resolveEmailProvider()).toBeNull();
  });

  it("rejects unknown provider ids with the supported list", () => {
    clearEmailEnv();
    vi.stubEnv("EMAIL_PROVIDER", "postmark");
    expect(() => resolveEmailProvider()).toThrow(
      'Unknown EMAIL_PROVIDER "postmark". Supported providers: resend, ses, smtp.',
    );
  });

  it("reports email as configured only when the resolved provider is ready", () => {
    clearEmailEnv();
    expect(isEmailConfigured()).toBe(false);

    vi.stubEnv("EMAIL_PROVIDER", "ses");
    expect(isEmailConfigured()).toBe(false);

    vi.stubEnv("SES_REGION", "eu-central-1");
    expect(isEmailConfigured()).toBe(true);

    clearEmailEnv();
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    expect(isEmailConfigured()).toBe(false);

    vi.stubEnv("RESEND_API_KEY", "email-key");
    expect(isEmailConfigured()).toBe(true);

    clearEmailEnv();
    vi.stubEnv("EMAIL_PROVIDER", "smtp");
    expect(isEmailConfigured()).toBe(false);

    vi.stubEnv("SMTP_URL", "smtp://mail.example.com:1025");
    expect(isEmailConfigured()).toBe(true);
  });
});
