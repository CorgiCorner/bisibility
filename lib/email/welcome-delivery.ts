import "server-only";

import { resolveFounderEmailIdentity } from "./founder-email-identity";
import { sendEmail } from "./send";
import { welcomeEmail, welcomeFollowupEmail } from "./welcome-template";

type WelcomeRecipient = {
  email: string;
  name: string;
  profileNameTrusted: boolean;
};

type WelcomeVariant = "completed" | "incomplete";

export type PreparedWelcomeEmail = {
  category: "transactional";
  from: string;
  html: string;
  replyTo: string;
  subject: string;
  text: string;
  to: string;
};

export function prepareWelcomeEmail(
  recipient: WelcomeRecipient & { variant: WelcomeVariant },
  origin: string,
): PreparedWelcomeEmail {
  const identity = resolveFounderEmailIdentity();
  const message = welcomeEmail({ ...recipient, ...identity, origin });
  return { ...message, category: "transactional", to: recipient.email };
}

export async function sendPreparedWelcomeEmail(prepared: PreparedWelcomeEmail) {
  await sendEmail(prepared);
}

export async function sendWelcomeFollowupEmail(
  recipient: WelcomeRecipient & { unsubscribeUrl: string },
) {
  const identity = resolveFounderEmailIdentity();
  const message = welcomeFollowupEmail({ ...recipient, ...identity });
  await sendEmail({ ...message, category: "bulk", to: recipient.email });
}
