import { getInstanceMailRuntime } from "./instance-mail-runtime";
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
 * EMAIL_PROVIDER selects the transport when it is set. A stored self-host
 * provider is used only when that variable is empty. Ambient credentials never
 * select a provider on their own.
 */
export function resolveEmailProvider(): EmailProvider | null {
  const requested = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (!requested) {
    const stored = getInstanceMailRuntime();
    return stored ? emailProviders[stored.provider] : null;
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
