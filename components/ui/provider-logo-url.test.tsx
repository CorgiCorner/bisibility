import { afterEach, describe, expect, it, vi } from "vitest";
import { buildLogoDevUrl } from "./provider-logo-url";

describe("buildLogoDevUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds a logo.dev URL with the public token and provider domain", () => {
    vi.stubEnv("NEXT_PUBLIC_LOGODEV_TOKEN", "test-token");

    expect(
      buildLogoDevUrl({
        domain: "dataforseo.com",
        token: process.env.NEXT_PUBLIC_LOGODEV_TOKEN,
      }),
    ).toBe("https://img.logo.dev/dataforseo.com?token=test-token&size=64&format=png");
  });

  it("returns null when the token or domain is missing", () => {
    expect(buildLogoDevUrl({ domain: "serpapi.com", token: "" })).toBeNull();
    expect(buildLogoDevUrl({ domain: "", token: "test-token" })).toBeNull();
  });
});
