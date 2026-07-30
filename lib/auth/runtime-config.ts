import "server-only";

import "@/lib/deployment/runtime-env.generated";

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

export const ENABLED_SOCIAL_PROVIDERS = {
  github: Boolean(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET),
  google: Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
} as const;

export const DEMO_FIXED_OTP_ENABLED = process.env.DEMO_FIXED_OTP === "1";
export const DEMO_FIXED_OTP_ACKNOWLEDGED = process.env.DEMO_INSTANCE_INSECURE_AUTH_ACK === "1";

if (process.env.ALLOW_INSECURE_FIXED_OTP === "1" && process.env.NODE_ENV === "production") {
  throw new Error(
    "ALLOW_INSECURE_FIXED_OTP must not be set in production. Use DEMO_FIXED_OTP=1 for throwaway demo instances.",
  );
}

if (
  DEMO_FIXED_OTP_ENABLED &&
  process.env.NODE_ENV === "production" &&
  !DEMO_FIXED_OTP_ACKNOWLEDGED
) {
  throw new Error(
    "Refusing to enable demo fixed-OTP auth in production without DEMO_INSTANCE_INSECURE_AUTH_ACK=1",
  );
}

if (DEMO_FIXED_OTP_ENABLED && process.env.NODE_ENV === "production") {
  console.warn(
    "[auth] SECURITY: demo fixed-OTP auth is ENABLED in production - anyone who knows the code can sign in. Never use on an instance with real data.",
  );
}

export const FIXED_OTP_ENABLED =
  (process.env.ALLOW_INSECURE_FIXED_OTP === "1" && process.env.NODE_ENV !== "production") ||
  DEMO_FIXED_OTP_ENABLED;

export const DEV_FIXED_OTP_CODE = FIXED_OTP_ENABLED ? "000000" : null;
export const DEV_DEMO_EMAIL = FIXED_OTP_ENABLED ? "demo@acme.dev" : null;
