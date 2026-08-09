import { escapeHtml } from "./escape-html";

export type TeamInviteEmailInput = {
  expiresAt: Date;
  inviteLink: string;
  inviter: { email: string; name: string };
  projectName: string;
  role: string;
};

function roleLabel(role: string) {
  if (role === "admin") return "Admin";
  if (role === "viewer") return "Viewer";
  return "Editor";
}

function inviterLabel(inviter: TeamInviteEmailInput["inviter"]) {
  const name = inviter.name.trim();
  return name && name !== inviter.email ? `${name} (${inviter.email})` : inviter.email;
}

function expiryLabel(expiresAt: Date) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(expiresAt);
}

function subjectFor(projectName: string) {
  const normalized = projectName.replace(/[\r\n\t]+/g, " ").trim() || "your project";
  const prefix = "Invitation to ";
  return `${prefix}${normalized.slice(0, 59 - prefix.length)}`;
}

export function teamInviteEmail(input: TeamInviteEmailInput) {
  const expires = expiryLabel(input.expiresAt);
  const inviter = inviterLabel(input.inviter);
  const role = roleLabel(input.role);
  const safe = {
    expires: escapeHtml(expires),
    inviteLink: escapeHtml(input.inviteLink),
    inviter: escapeHtml(inviter),
    projectName: escapeHtml(input.projectName),
    role: escapeHtml(role),
  };

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#F2EEE4;color:#1A1813;font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;background:#F2EEE4;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:560px;border-collapse:separate;background:#FBF9F4;border:1px solid #D9D4C7;border-radius:16px;">
          <tr>
            <td style="padding:22px 24px;border-bottom:1px solid #E8E4D9;">
              <span style="display:inline-block;width:32px;height:32px;line-height:32px;text-align:center;border-radius:9px;background:#D97757;color:#1A1813;font-size:18px;font-weight:700;">B</span>
              <span style="display:inline-block;margin-left:10px;font-size:18px;font-weight:700;vertical-align:9px;">bisibility</span>
            </td>
          </tr>
          <tr>
            <td style="padding:30px 24px 14px;">
              <div style="font-size:13px;line-height:20px;color:#6B6657;">Project invitation</div>
              <h1 style="margin:6px 0 0;font-size:28px;line-height:34px;font-weight:700;overflow-wrap:anywhere;">${safe.projectName}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 22px;">
              <p style="margin:0 0 18px;font-size:15px;line-height:23px;color:#6B6657;">${safe.inviter} invited you to join this project.</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;background:#ECE7DB;border-radius:10px;">
                <tr><td style="padding:12px 14px;font-size:13px;color:#6B6657;">Role</td><td align="right" style="padding:12px 14px;font-size:13px;font-weight:700;">${safe.role}</td></tr>
                <tr><td style="padding:0 14px 12px;font-size:13px;color:#6B6657;">Expires</td><td align="right" style="padding:0 14px 12px;font-size:13px;font-weight:700;">${safe.expires}</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 28px;">
              <a href="${safe.inviteLink}" style="display:block;min-height:44px;line-height:44px;padding:0 18px;border-radius:9px;background:#1A1813;color:#FFFFFF;font-size:16px;font-weight:700;text-align:center;text-decoration:none;">Accept invitation</a>
              <p style="margin:16px 0 6px;font-size:12px;line-height:18px;color:#6B6657;">If the button does not work, copy and paste this URL:</p>
              <p style="margin:0;font-family:monospace;font-size:12px;line-height:18px;color:#1A1813;overflow-wrap:anywhere;word-break:break-word;">${safe.inviteLink}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 24px;border-top:1px solid #E8E4D9;font-size:12px;line-height:18px;color:#6B6657;">You received this email because ${safe.inviter} invited you to bisibility. If you did not expect it, you can ignore this message.</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `Invitation to ${input.projectName}`,
    "",
    `${inviter} invited you to join ${input.projectName} on bisibility.`,
    `Role: ${role}`,
    `Invited by: ${inviter}`,
    `Expires: ${expires}`,
    "",
    "Accept invitation:",
    input.inviteLink,
    "",
    `You received this email because ${inviter} invited you to bisibility.`,
    "If you did not expect it, you can ignore this message.",
  ].join("\n");

  return { html, subject: subjectFor(input.projectName), text };
}
