import type * as Sentry from "@sentry/nextjs";

// Loading the reporting SDK costs real compile and startup time, so a deployment without a
// DSN never pulls it into the server or edge runtime. The value is read per call rather
// than at module scope, because on the Node runtime the deployment environment can arrive
// through the baked env module, which is imported below and only fills the keys the
// platform did not already provide.
async function resolveErrorSinkDsn() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./lib/deployment/runtime-env.generated");
  }

  return process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
}

export async function register() {
  const errorSinkDsn = await resolveErrorSinkDsn();

  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertCanonicalHostedMcpOrigin } = await import(
      "./lib/deployment/canonical-mcp-origin"
    );
    const { warnDeprecatedInspectionDailyBudget } = await import(
      "./lib/deployment/deprecated-inspection-budget"
    );
    assertCanonicalHostedMcpOrigin();
    warnDeprecatedInspectionDailyBudget();
    if (errorSinkDsn) {
      await import("./sentry.server.config");
    }
    const { enforceMigrationsAtStartup } = await import("./lib/data-migrations/startup");
    await enforceMigrationsAtStartup();
  }

  if (process.env.NEXT_RUNTIME === "edge" && errorSinkDsn) {
    await import("./sentry.edge.config");
  }
}

export const onRequestError: typeof Sentry.captureRequestError = async (...args) => {
  if (!(await resolveErrorSinkDsn())) {
    return;
  }

  const sentry = await import("@sentry/nextjs");
  await sentry.captureRequestError(...args);
};
