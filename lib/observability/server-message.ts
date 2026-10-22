import "server-only";
import { errorReportingRuntime, sentryRuntimeIdentity } from "@/lib/observability/runtime-identity";

type ServerMessageContext = {
  level: "warning" | "error";
  extra: Record<string, string | number | undefined>;
};

/** Server reports contain fixed messages and safe diagnostic fields, never raw errors. */
export async function reportServerMessage(message: string, context: ServerMessageContext) {
  const dsn = process.env.SENTRY_DSN?.trim() || process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
  if (dsn) {
    try {
      const module = await import("@sentry/nextjs");
      const sdk = ("default" in module ? module.default : module) as typeof module;
      const identity = sentryRuntimeIdentity(errorReportingRuntime());
      // App instrumentation owns its client; a standalone worker may not have one yet.
      if (!sdk.getClient()) {
        sdk.init({
          dsn,
          defaultIntegrations: false,
          tracesSampleRate: 0,
          environment:
            process.env.SENTRY_ENVIRONMENT ||
            process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
            process.env.NODE_ENV,
          ...identity,
        });
      }
      sdk.captureMessage(message, { ...context, tags: identity.initialScope.tags });
      return;
    } catch {
      // Reporting must never interrupt the caller's work.
    }
  }
  if (context.level === "warning") console.warn(message, context);
  else console.error(message, context);
}
