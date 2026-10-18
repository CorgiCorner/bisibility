import packageJson from "@/package.json";
import { afterEach, expect, it, vi } from "vitest";

const wrappers = vi.hoisted(() => ({ sentry: vi.fn((config, _options) => config) }));
vi.mock("@sentry/nextjs", () => ({ withSentryConfig: wrappers.sentry }));
vi.mock("next-intl/plugin", () => ({ default: () => (config: unknown) => config }));
afterEach(() => vi.unstubAllEnvs());

it("bakes only named public build fields and aligns browser and source-map releases", async () => {
  vi.stubEnv("APP_VERSION", "a".repeat(40));
  vi.stubEnv("APP_REVISION", "a".repeat(40));
  vi.stubEnv("SENTRY_RELEASE", "selected-release");
  vi.stubEnv("NEXT_PUBLIC_SENTRY_RELEASE", "superseded-release");
  vi.stubEnv("SENTRY_AUTH_TOKEN", "private-build-token");
  vi.resetModules();
  const { default: config } = await import("../../next.config");
  expect(config.env).toEqual({
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
    NEXT_PUBLIC_APP_REVISION: "a".repeat(40),
    NEXT_PUBLIC_SENTRY_RELEASE: "selected-release",
  });
  expect(wrappers.sentry).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      release: { name: "selected-release" },
    }),
  );
  expect(JSON.stringify(config.env)).not.toContain("private-build-token");
});
