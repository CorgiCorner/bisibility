import { describe, expect, it } from "vitest";
import { teamInviteEmail } from "./team-invite-template";

describe("teamInviteEmail", () => {
  it("uses a valid product-like system font stack in the inline body style", () => {
    const { html } = teamInviteEmail({
      expiresAt: new Date("2026-08-01T00:00:00Z"),
      inviteLink: "https://example.com/invite/token",
      inviter: { email: "owner@example.com", name: "Owner" },
      projectName: "Acme",
      role: "editor",
    });

    expect(html).toContain(
      `<body style="margin:0;padding:0;background:#F2EEE4;color:#1A1813;font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">`,
    );
  });
});
