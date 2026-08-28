import { afterEach, describe, expect, it, vi } from "vitest";
import { oauthRequestOrigin, oauthResultUrl } from "./oauth-url";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("OAuth URLs", () => {
  it("uses the public site origin instead of an internal request origin", () => {
    vi.stubEnv("SITE_URL", "https://bisibility.com/app");
    vi.stubEnv("BETTER_AUTH_URL", "https://auth.example.test");

    const result = oauthResultUrl(
      "https://localhost:3000/api/integrations/google/callback",
      "/onboarding?step=3&projectId=prj_1",
    );

    expect(result.toString()).toBe("https://bisibility.com/onboarding?step=3&projectId=prj_1");
  });

  it("falls back to the configured auth origin", () => {
    vi.stubEnv("SITE_URL", "");
    vi.stubEnv("BETTER_AUTH_URL", "https://auth.example.test/path");

    expect(oauthRequestOrigin("https://localhost:3000/callback")).toBe("https://auth.example.test");
  });

  it("keeps the request origin for self-hosted instances without URL configuration", () => {
    vi.stubEnv("SITE_URL", "");
    vi.stubEnv("BETTER_AUTH_URL", "");

    expect(oauthRequestOrigin("http://self-hosted.test:8080/callback")).toBe(
      "http://self-hosted.test:8080",
    );
  });
});

describe("OAuth result path validation", () => {
  const offOrigin = [
    "/\t/evil.example",
    "/\n/evil.example",
    "/%09/evil.example",
    "//evil.example",
    "/.//evil.example",
    "/a/..//evil.example",
    "/%2e//evil.example",
    "/\\evil.example",
  ];

  it.each(offOrigin)("never redirects off-origin for %j", (returnPath) => {
    vi.stubEnv("SITE_URL", "https://app.example.com");
    vi.stubEnv("BETTER_AUTH_URL", "");

    const url = oauthResultUrl(
      "https://app.example.com/api/integrations/slack/callback",
      returnPath,
    );

    expect(url.origin).toBe("https://app.example.com");
    expect(url.pathname).toBe("/app");
    expect(url.search).toBe("");
  });

  it("keeps a safe path and query", () => {
    vi.stubEnv("SITE_URL", "https://app.example.com");
    vi.stubEnv("BETTER_AUTH_URL", "");

    const url = oauthResultUrl(
      "https://app.example.com/x",
      "/app/prj_a00000000000000000000000/integrations?tab=slack",
    );

    expect(url.href).toBe(
      "https://app.example.com/app/prj_a00000000000000000000000/integrations?tab=slack",
    );
  });
});
