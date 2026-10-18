import packageJson from "@/package.json";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ init: vi.fn(), nativeNodeFetchIntegration: vi.fn() }));
vi.mock("@sentry/nextjs", () => sdk);
vi.mock("../deployment/runtime-env.generated", () => ({}));

beforeEach(() => {
  vi.resetModules();
  sdk.init.mockClear();
  for (const key of [
    "APP_VERSION",
    "APP_REVISION",
    "VERCEL_GIT_COMMIT_SHA",
    "SENTRY_RELEASE",
    "NEXT_PUBLIC_SENTRY_RELEASE",
    "NEXT_PUBLIC_APP_VERSION",
    "NEXT_PUBLIC_APP_REVISION",
  ]) {
    vi.stubEnv(key, "");
  }
});
afterEach(() => vi.unstubAllEnvs());

describe("Sentry runtime build attribution", () => {
  it.each(["server", "edge"] as const)(
    "labels %s events without confusing version and revision",
    async (runtime) => {
      vi.stubEnv("SENTRY_DSN", "https://telemetry.example.com/1");
      vi.stubEnv("NEXT_PUBLIC_APP_VERSION", packageJson.version);
      vi.stubEnv("NEXT_PUBLIC_APP_REVISION", "a".repeat(40));
      vi.stubEnv("NEXT_PUBLIC_SENTRY_RELEASE", "source-map-release");
      vi.stubEnv("SENTRY_RELEASE", "wrong-runtime-override");
      vi.stubEnv("APP_VERSION", "b".repeat(40));
      if (runtime === "server") await import("../../sentry.server.config");
      else await import("../../sentry.edge.config");

      expect(sdk.init).toHaveBeenCalledWith(
        expect.objectContaining({
          release: "source-map-release",
          sendDefaultPii: false,
          initialScope: {
            tags: {
              "app.version": packageJson.version,
              "app.revision": "a".repeat(40),
              "app.runtime": runtime,
            },
          },
        }),
      );
    },
  );
});
