export type ErrorRuntime = "browser" | "server" | "edge" | "worker";

type BuildIdentity = {
  version?: string;
  revision?: string;
  release?: string;
};

export function resolveSentryBuild(env: Record<string, string | undefined>, version: string) {
  const release =
    env.SENTRY_RELEASE?.trim() || env.NEXT_PUBLIC_SENTRY_RELEASE?.trim() || env.APP_VERSION?.trim();
  const revision = [env.APP_REVISION, env.VERCEL_GIT_COMMIT_SHA, env.APP_VERSION, release]
    .map((value) => value?.trim())
    .find((value) => value && /^[0-9a-f]{40}$/i.test(value));
  return { version, revision, release };
}

export function sentryBuildIdentity(build: BuildIdentity, runtime: ErrorRuntime) {
  const tags: Record<string, string> = {
    "app.version": build.version?.trim() || "unknown",
    "app.runtime": runtime,
  };
  if (build.revision && /^[0-9a-f]{40}$/i.test(build.revision)) {
    tags["app.revision"] = build.revision;
  }
  return { ...(build.release ? { release: build.release } : {}), initialScope: { tags } };
}
