import * as Sentry from "@sentry/nextjs";

function parseSampleRate(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment:
    process.env.SENTRY_ENVIRONMENT ||
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
    process.env.NODE_ENV,
  release:
    process.env.SENTRY_RELEASE || process.env.NEXT_PUBLIC_SENTRY_RELEASE || process.env.APP_VERSION,
  sendDefaultPii: false,
  tracesSampleRate: parseSampleRate(
    process.env.SENTRY_TRACES_SAMPLE_RATE || process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
    process.env.NODE_ENV === "production" ? 0.05 : 1,
  ),
});
