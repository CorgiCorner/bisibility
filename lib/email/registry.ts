import { resendEmailProvider } from "./providers/resend";
import { sesEmailProvider } from "./providers/ses";
import { smtpEmailProvider } from "./providers/smtp";
import { EMAIL_PROVIDER_IDS, type EmailProvider, type EmailProviderId } from "./types";

const emailProviders: Record<EmailProviderId, EmailProvider> = {
  resend: resendEmailProvider,
  ses: sesEmailProvider,
  smtp: smtpEmailProvider,
};

/**
 * Only explicit EMAIL_PROVIDER selects a provider; ambient credentials never do.
 */
export function resolveEmailProvider(): EmailProvider | null {
  const requested = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (!requested) {
    return null;
  }

  const provider = emailProviders[requested as EmailProviderId];
  if (!provider) {
    throw new Error(
      `Unknown EMAIL_PROVIDER "${requested}". Supported providers: ${EMAIL_PROVIDER_IDS.join(", ")}.`,
    );
  }
  return provider;
}

export function isEmailConfigured() {
  return resolveEmailProvider()?.isConfigured() ?? false;
}
