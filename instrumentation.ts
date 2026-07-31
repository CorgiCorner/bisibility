import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertCanonicalHostedMcpOrigin } = await import(
      "./lib/deployment/canonical-mcp-origin"
    );
    assertCanonicalHostedMcpOrigin();
    await import("./sentry.server.config");
    const { enforceMigrationsAtStartup } = await import("./lib/data-migrations/startup");
    await enforceMigrationsAtStartup();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
