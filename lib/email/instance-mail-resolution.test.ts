import { afterEach, describe, expect, it, vi } from "vitest";
import { configuredEmailFrom } from "./from";
import { setInstanceMailRuntime, storedMailProvider } from "./instance-mail-runtime";
import { sesEmailProvider } from "./providers/ses";
import { smtpEmailProvider } from "./providers/smtp";
import { isEmailConfigured, resolveEmailProvider } from "./registry";

const storedResend = {
  provider: "resend" as const,
  resendApiKey: "re_test_key",
  sender: "Mail <ops@example.com>",
  sesAccessKeyId: null,
  sesRegion: null,
  sesSecretAccessKey: null,
  smtpHost: null,
  smtpPassword: null,
  smtpPort: null,
  smtpUsername: null,
};

describe("stored instance mail resolution", () => {
  afterEach(() => {
    setInstanceMailRuntime(null);
    vi.unstubAllEnvs();
  });

  it("uses the stored provider only when EMAIL_PROVIDER is empty", () => {
    vi.stubEnv("EMAIL_PROVIDER", "");
    vi.stubEnv("RESEND_API_KEY", "");
    setInstanceMailRuntime(storedResend);

    expect(resolveEmailProvider()?.id).toBe("resend");
    expect(isEmailConfigured()).toBe(true);
    expect(configuredEmailFrom()).toBe("Mail <ops@example.com>");

    vi.stubEnv("EMAIL_PROVIDER", "smtp");
    vi.stubEnv("SMTP_URL", "");
    expect(resolveEmailProvider()?.id).toBe("smtp");
    expect(storedMailProvider("resend")).toBeNull();
    expect(smtpEmailProvider.isConfigured()).toBe(false);
  });

  it("keeps an environment sender ahead of the stored sender", () => {
    vi.stubEnv("EMAIL_FROM", "Env <env@example.com>");
    setInstanceMailRuntime(storedResend);
    expect(configuredEmailFrom()).toBe("Env <env@example.com>");
  });

  it("uses a stored SES region and SMTP host when their environment variables are empty", () => {
    vi.stubEnv("EMAIL_PROVIDER", "");
    vi.stubEnv("SES_REGION", "");
    vi.stubEnv("AWS_REGION", "");
    vi.stubEnv("AWS_DEFAULT_REGION", "");
    vi.stubEnv("SMTP_URL", "");
    setInstanceMailRuntime({
      ...storedResend,
      provider: "ses",
      resendApiKey: null,
      sesRegion: "eu-central-1",
    });
    expect(sesEmailProvider.isConfigured()).toBe(true);

    setInstanceMailRuntime({
      ...storedResend,
      provider: "smtp",
      resendApiKey: null,
      smtpHost: "smtp.example.com",
      smtpPort: 587,
    });
    expect(smtpEmailProvider.isConfigured()).toBe(true);
  });
});
