import { describe, expect, it } from "vitest";
import { instanceMailFormSchema, isEmailSender } from "./instance-mail-schema";

const base = {
  code: "123456",
  provider: "resend" as const,
  replaceCredentials: true,
  resendApiKey: "re_test_key",
  sender: "Mail <ops@example.com>",
  sesAccessKeyId: "",
  sesRegion: "",
  sesSecretAccessKey: "",
  smtpHost: "",
  smtpPassword: "",
  smtpPort: "",
  smtpUsername: "",
};

const strict = instanceMailFormSchema({ credentialsRequired: true, senderRequired: true });

describe("instance mail form schema", () => {
  it("accepts a named sender and a plain address", () => {
    expect(isEmailSender("Mail <ops@example.com>")).toBe(true);
    expect(isEmailSender("ops@example.com")).toBe(true);
    expect(isEmailSender("not an address")).toBe(false);
    expect(strict.safeParse(base).success).toBe(true);
  });

  it("requires a matched SES key pair and a valid SMTP port", () => {
    const ses = strict.safeParse({
      ...base,
      provider: "ses",
      sesAccessKeyId: "example-access-key-id",
      sesRegion: "eu-central-1",
    });
    expect(ses.success).toBe(false);

    const smtp = strict.safeParse({
      ...base,
      provider: "smtp",
      smtpHost: "smtp.example.com",
      smtpPassword: "secret",
      smtpPort: "70000",
      smtpUsername: "mailer",
    });
    expect(smtp.success).toBe(false);
  });

  it("keeps stored credentials when replacement is not required", () => {
    const keep = instanceMailFormSchema({ credentialsRequired: false, senderRequired: false });
    expect(keep.safeParse({ ...base, resendApiKey: "", sender: "" }).success).toBe(true);
  });
});
