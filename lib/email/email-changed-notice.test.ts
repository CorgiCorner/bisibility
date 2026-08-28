import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendEmailMock } = vi.hoisted(() => ({ sendEmailMock: vi.fn() }));
const originalEnvironment = { EMAIL_FOUNDER_FROM: process.env.EMAIL_FOUNDER_FROM };

vi.mock("@/lib/email/send", () => ({ sendEmail: sendEmailMock }));

import { emailChangedNotice, sendEmailChangedNotice } from "./email-changed-notice";

const changedAt = new Date("2026-08-27T20:15:00.000Z");

afterEach(() => {
  if (originalEnvironment.EMAIL_FOUNDER_FROM === undefined) {
    delete process.env.EMAIL_FOUNDER_FROM;
  } else {
    process.env.EMAIL_FOUNDER_FROM = originalEnvironment.EMAIL_FOUNDER_FROM;
  }
});

describe("email changed notice", () => {
  beforeEach(() => sendEmailMock.mockReset());

  it("names the new address and the change date in both bodies", () => {
    const notice = emailChangedNotice({
      changedAt,
      newEmail: "next@example.com",
      previousEmail: "owner@example.com",
    });

    expect(notice.subject).toBe("Your bisibility email address was changed");
    expect(notice.text).toBe(
      "The email address on your bisibility account was changed to next@example.com on 27 August 2026. If you did not do this, reply to this email right away.",
    );
    expect(notice.html).toContain("next@example.com");
    expect(notice.html).toContain("27 August 2026");
    expect(notice.html).toContain("If you did not do this, reply to this email right away.");
  });

  it("escapes an address that carries markup", () => {
    const notice = emailChangedNotice({
      changedAt,
      newEmail: '"><script>alert(1)</script>@example.com',
      previousEmail: "owner@example.com",
    });

    expect(notice.html).not.toContain("<script>");
    expect(notice.html).toContain("&lt;script&gt;");
  });

  it("sends the notice to the address that lost the account", async () => {
    process.env.EMAIL_FOUNDER_FROM = "Security <security@example.com>";

    await sendEmailChangedNotice({
      changedAt,
      newEmail: "next@example.com",
      previousEmail: "owner@example.com",
    });

    expect(sendEmailMock).toHaveBeenCalledExactlyOnceWith({
      category: "transactional",
      from: "Security <security@example.com>",
      html: expect.stringContaining("next@example.com"),
      replyTo: "Security <security@example.com>",
      subject: "Your bisibility email address was changed",
      text: expect.stringContaining("next@example.com"),
      to: "owner@example.com",
    });
  });
});
