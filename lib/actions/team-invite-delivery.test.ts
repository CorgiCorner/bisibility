import { afterEach, describe, expect, it, vi } from "vitest";
import { assertInviteMailerReady, deliverInvite } from "./team-invite-delivery";

const { sendEmailMock } = vi.hoisted(() => ({ sendEmailMock: vi.fn() }));

vi.mock("@/lib/email/send", () => ({ sendEmail: sendEmailMock }));

function clearEmailEnv() {
  vi.stubEnv("EMAIL_PROVIDER", "");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("SES_REGION", "");
  vi.stubEnv("AWS_REGION", "");
  vi.stubEnv("AWS_DEFAULT_REGION", "");
}

const invite = {
  email: "teammate@example.com",
  expiresAt: new Date("2026-08-01T00:00:00Z"),
  id: "invite-1",
  invitedBy: { email: "owner@example.com", name: "Owner Example" },
  project: { name: "Acme" },
  role: "editor",
};

describe("team invite delivery", () => {
  afterEach(() => {
    sendEmailMock.mockReset();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("delivers invites through the shared email sender", async () => {
    clearEmailEnv();
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "email-key");
    vi.stubEnv("SITE_URL", "https://app.example.com");
    vi.stubGlobal("fetch", vi.fn());

    const delivered = await deliverInvite(invite, "raw-token");

    expect(delivered.inviteLink).toBe("https://app.example.com/invite/raw-token");
    expect(sendEmailMock).toHaveBeenCalledExactlyOnceWith({
      category: "transactional",
      html: expect.stringContaining("https://app.example.com/invite/raw-token"),
      subject: "Invitation to Acme",
      text: expect.stringContaining("https://app.example.com/invite/raw-token"),
      to: "teammate@example.com",
    });
    const message = sendEmailMock.mock.calls[0]?.[0];
    expect(message.html).toContain('role="presentation"');
    expect(message.html).toContain("Bisibility");
    expect(message.html).toContain(">Acme<");
    expect(message.html).toContain("Editor");
    expect(message.html).toContain("Owner Example (owner@example.com)");
    expect(message.html).toContain("invited you to Bisibility");
    expect(message.html).toContain("August 1, 2026");
    expect(message.html.match(/<a\b/g)).toHaveLength(1);
    expect(message.html).toContain("min-height:44px");
    expect(message.html).toContain("font-size:16px");
    expect(message.html).not.toMatch(/<(?:link|script)\b/i);
    expect(message.html).not.toMatch(/<img\b/i);
    expect(message.text).toContain("Acme");
    expect(message.text).toContain("Role: Editor");
    expect(message.text).toContain("Invited by: Owner Example (owner@example.com)");
    expect(message.text).toContain("invited you to Bisibility");
    expect(message.text).toContain("Expires: August 1, 2026");
    expect(message.text).not.toMatch(/<[^>]+>/);
    expect(message.subject.length).toBeLessThan(60);
  });

  it("escapes hostile workspace content in invitation HTML", async () => {
    clearEmailEnv();
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "email-key");
    vi.stubEnv("SITE_URL", "https://app.example.com");
    vi.stubGlobal("fetch", vi.fn());
    const hostileName = "invite-test-<img src=x onerror=alert(1)>";

    await deliverInvite({ ...invite, project: { name: hostileName } }, "raw-token");

    const message = sendEmailMock.mock.calls[0]?.[0];
    expect(message.html).toContain("invite-test-&lt;img src=x onerror=alert(1)&gt;");
    expect(message.html).not.toContain("<img src=x");
    expect(message.html).toContain('href="https://app.example.com/invite/raw-token"');
    expect(message.text).toContain(hostileName);
    expect(message.text).not.toContain("&lt;");
    expect(message.subject).toContain(hostileName);
  });

  it("does not log the raw invite link when no provider is configured", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    clearEmailEnv();
    vi.stubEnv("SITE_URL", "https://app.example.com");

    await deliverInvite(invite, "raw-token");

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith("[team] invite email skipped: no provider configured.");
    const logged = JSON.stringify(info.mock.calls);
    expect(logged).not.toContain("raw-token");
    expect(logged).not.toContain("/invite/");
  });

  it("treats any configured provider as a ready mailer", () => {
    clearEmailEnv();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("EMAIL_PROVIDER", "ses");
    vi.stubEnv("SES_REGION", "eu-central-1");

    expect(() => assertInviteMailerReady()).not.toThrow();
  });

  it("refuses to invite unmailable teammates in production", () => {
    clearEmailEnv();
    vi.stubEnv("NODE_ENV", "production");

    expect(() => assertInviteMailerReady()).toThrow(
      "Configure EMAIL_PROVIDER (resend, ses, smtp) to send team invites.",
    );
  });
});
