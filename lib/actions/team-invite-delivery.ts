import "server-only";

import { isEmailConfigured } from "@/lib/email/registry";
import { sendEmail } from "@/lib/email/send";
import { teamInviteEmail } from "@/lib/email/team-invite-template";
import { SUPPORTED_EMAIL_PROVIDERS } from "@/lib/email/types";

type InviteDeliveryRow = {
  email: string;
  expiresAt: Date;
  id: string;
  invitedBy: { email: string; name: string };
  project: { name: string };
  role: string;
};

type InviteEmail = InviteDeliveryRow & { inviteLink: string };

export function assertInviteMailerReady() {
  if (!isEmailConfigured() && process.env.NODE_ENV === "production") {
    throw new Error(
      `Configure EMAIL_PROVIDER (${SUPPORTED_EMAIL_PROVIDERS}) to send team invites.`,
    );
  }
}

async function sendInviteEmail(input: InviteEmail) {
  if (!isEmailConfigured()) {
    console.info("[team] invite email skipped: no provider configured.");
    return;
  }

  const message = teamInviteEmail({
    expiresAt: input.expiresAt,
    inviteLink: input.inviteLink,
    inviter: input.invitedBy,
    projectName: input.project.name,
    role: input.role,
  });
  await sendEmail({
    category: "transactional",
    ...message,
    to: input.email,
  });
}

export async function deliverInvite(invite: InviteDeliveryRow, rawToken: string) {
  const base =
    process.env.SITE_URL ??
    process.env.BETTER_AUTH_URL ??
    `http://localhost:${process.env.PORT ?? "3000"}`;
  const link = new URL(`/invite/${rawToken}`, base).toString();
  await sendInviteEmail({
    ...invite,
    inviteLink: link,
  });
  return { expiresAt: invite.expiresAt.toISOString(), id: invite.id, inviteLink: link };
}
