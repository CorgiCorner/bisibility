const DEMO_EMAIL_OTP_RATE_LIMIT = {
  max: 30,
  window: 60,
} as const;

export function demoEmailOtpRateLimit(enabled: boolean, acknowledged: boolean) {
  return enabled && acknowledged ? DEMO_EMAIL_OTP_RATE_LIMIT : undefined;
}
