import { describe, expect, it } from "vitest";
import { resolveSentryBuild, sentryBuildIdentity } from "./build-identity";

const revision = "a".repeat(40);

describe("error report build identity", () => {
  it("keeps the shipped product version separate from a deployment SHA", () => {
    const build = resolveSentryBuild({ APP_VERSION: revision }, "0.36.0");
    expect(build).toEqual({ version: "0.36.0", revision, release: revision });
    expect(sentryBuildIdentity(build, "worker")).toEqual({
      release: revision,
      initialScope: {
        tags: {
          "app.version": "0.36.0",
          "app.revision": revision,
          "app.runtime": "worker",
        },
      },
    });
  });

  it("uses one explicit release for runtime and source-map upload", () => {
    expect(
      resolveSentryBuild(
        {
          SENTRY_RELEASE: "explicit-release",
          NEXT_PUBLIC_SENTRY_RELEASE: "public-release",
          APP_VERSION: revision,
        },
        "0.36.0",
      ),
    ).toEqual({ version: "0.36.0", revision, release: "explicit-release" });
    expect(
      resolveSentryBuild({ NEXT_PUBLIC_SENTRY_RELEASE: "public-release" }, "0.36.0").release,
    ).toBe("public-release");
  });

  it("omits unknown revisions and only exposes allowlisted build fields", () => {
    const build = resolveSentryBuild(
      { APP_REVISION: "unknown", DATABASE_URL: "private" },
      "0.36.0",
    );
    expect(sentryBuildIdentity(build, "server")).toEqual({
      initialScope: { tags: { "app.version": "0.36.0", "app.runtime": "server" } },
    });
  });

  it("prefers the exact source revision over a human release label", () => {
    expect(
      resolveSentryBuild(
        {
          APP_REVISION: revision,
          VERCEL_GIT_COMMIT_SHA: "b".repeat(40),
          SENTRY_RELEASE: "v0.36.0",
        },
        "0.36.0",
      ).revision,
    ).toBe(revision);
  });
});
