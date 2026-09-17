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
