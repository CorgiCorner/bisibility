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
