import "server-only";
import packageJson from "@/package.json";
import { type ErrorRuntime, resolveSentryBuild, sentryBuildIdentity } from "./build-identity";
import { sentryNextBuildIdentity } from "./next-build-identity";

// Server/edge/worker only. The browser receives individual build constants instead of the manifest.
export function sentryRuntimeIdentity(runtime: Exclude<ErrorRuntime, "browser">) {
  if (runtime !== "worker") return sentryNextBuildIdentity(runtime);
  const build = resolveSentryBuild(
    {
      APP_REVISION: process.env.APP_REVISION,
      APP_VERSION: process.env.APP_VERSION,
      VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
      SENTRY_RELEASE: process.env.SENTRY_RELEASE,
      NEXT_PUBLIC_SENTRY_RELEASE: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    },
    packageJson.version,
  );
  return sentryBuildIdentity(build, runtime);
}

export function errorReportingRuntime() {
  if (process.env.NEXT_RUNTIME === "edge") return "edge";
  return process.env.NEXT_RUNTIME === "nodejs" ? "server" : "worker";
}
