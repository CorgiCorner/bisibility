import "@/lib/deployment/runtime-env.generated";

import { sentryNextBuildIdentity } from "@/lib/observability/next-build-identity";
import { redactRequestSecrets, secretBearingRequest } from "@/lib/observability/secret-request";
import * as Sentry from "@sentry/nextjs";

function parseSampleRate(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
const sentryEnvironment =
  process.env.SENTRY_ENVIRONMENT ||
  process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
  process.env.NODE_ENV;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: sentryEnvironment,
  ...sentryNextBuildIdentity("server"),
  sendDefaultPii: false,
  integrations: [
    Sentry.nativeNodeFetchIntegration({ ignoreOutgoingRequests: secretBearingRequest }),
  ],
  beforeSend: (event) => redactRequestSecrets(event),
  beforeSendTransaction: (event) => redactRequestSecrets(event),
  beforeBreadcrumb: (breadcrumb) => redactRequestSecrets(breadcrumb),
  tracesSampleRate: parseSampleRate(
    process.env.SENTRY_TRACES_SAMPLE_RATE || process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
    process.env.NODE_ENV === "production" ? 0.05 : 1,
  ),
});
