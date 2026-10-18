import { type ErrorRuntime, sentryBuildIdentity } from "./build-identity";

export function sentryNextBuildIdentity(runtime: Exclude<ErrorRuntime, "worker">) {
  return sentryBuildIdentity(
    {
      version: process.env.NEXT_PUBLIC_APP_VERSION,
      revision: process.env.NEXT_PUBLIC_APP_REVISION,
      release: process.env.NEXT_PUBLIC_SENTRY_RELEASE || undefined,
    },
    runtime,
  );
}
