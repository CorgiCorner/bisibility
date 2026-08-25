import { registerErrorReportSink } from "@/lib/observability/error-reporting";
import type * as Sentry from "@sentry/nextjs";

function parseSampleRate(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

let captureRouterTransitionStart: typeof Sentry.captureRouterTransitionStart | undefined;
// Bounded for the same reason the report buffer is: a chunk fetch that never settles
// must not let navigations accumulate for the lifetime of the page.
const MAX_PENDING_ROUTER_TRANSITIONS = 20;
const pendingRouterTransitions: Parameters<typeof Sentry.captureRouterTransitionStart>[] = [];
let sentryLoadFailed = false;

// With a DSN set, errors thrown before the Sentry chunk finishes loading are not captured, and this is an accepted trade-off.
async function initializeSentry() {
  if (!dsn) {
    return;
  }

  const sentry = await import("@sentry/nextjs");
  sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    sendDefaultPii: false,
    tracesSampleRate: parseSampleRate(
      process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
      process.env.NODE_ENV === "production" ? 0.05 : 1,
    ),
  });
  registerErrorReportSink((error, context) => {
    sentry.withScope((scope) => {
      scope.setContext("nextjs", {
        digest: context.digest,
        pathname: context.pathname,
      });

      if (context.digest) {
        scope.setTag("next.digest", context.digest);
      }

      sentry.captureException(error);
    });
  });
  captureRouterTransitionStart = sentry.captureRouterTransitionStart;
  // Replayed transitions carry the load-time timestamp rather than the navigation time, and the skew is accepted because the window is short.
  for (const args of pendingRouterTransitions.splice(0)) {
    captureRouterTransitionStart(...args);
  }
}

// Exported so tests and callers can await a settled initialization instead of racing
// it. It never rejects: a chunk that fails to load is recorded, not thrown, because
// an unhandled rejection here would surface in every page that lost the network.
export const errorReportingReady = initializeSentry().catch(() => {
  sentryLoadFailed = true;
  pendingRouterTransitions.length = 0;
});

export function onRouterTransitionStart(
  ...args: Parameters<typeof Sentry.captureRouterTransitionStart>
) {
  if (sentryLoadFailed) {
    return;
  }
  if (captureRouterTransitionStart) {
    captureRouterTransitionStart(...args);
  } else if (dsn && pendingRouterTransitions.length < MAX_PENDING_ROUTER_TRANSITIONS) {
    pendingRouterTransitions.push(args);
  }
}
