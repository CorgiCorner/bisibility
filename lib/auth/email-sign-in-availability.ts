export const EMAIL_SIGN_IN_UNAVAILABLE_MESSAGE =
  "This instance has no email provider configured, so sign-in codes cannot be sent. The instance admin needs to set EMAIL_PROVIDER.";

export type EmailSignInAvailability = {
  firstRun: boolean;
  fixedOtpEnabled: boolean;
  isEmailConfigured: boolean;
  production: boolean;
};

export function isEmailSignInUnavailable({
  firstRun,
  fixedOtpEnabled,
  isEmailConfigured,
  production,
}: Readonly<EmailSignInAvailability>) {
  return !isEmailConfigured && production && !fixedOtpEnabled && !firstRun;
}
