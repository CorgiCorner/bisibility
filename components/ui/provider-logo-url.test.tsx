import { afterEach, describe, expect, it, vi } from "vitest";
import { buildLogoDevUrl } from "./provider-logo-url";

describe("buildLogoDevUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds a provider brand URL with the public token and a 404 fallback", () => {
    vi.stubEnv("NEXT_PUBLIC_LOGODEV_TOKEN", "test-token");

    const url = new URL(
      buildLogoDevUrl({
        domain: "example.com",
        token: process.env.NEXT_PUBLIC_LOGODEV_TOKEN,
      }) ?? "",
    );

    expect(url.hostname).toBe(["img", "logo", "dev"].join("."));
    expect(url.pathname).toBe("/example.com");
    expect(url.searchParams.get("fallback")).toBe("404");
    expect(url.searchParams.get("format")).toBe("png");
    expect(url.searchParams.get("size")).toBe("64");
    expect(url.searchParams.get("token")).toBe("test-token");
  });

  it("returns null when the token or domain is missing", () => {
    expect(buildLogoDevUrl({ domain: "example.com", token: "" })).toBeNull();
    expect(buildLogoDevUrl({ domain: "", token: "test-token" })).toBeNull();
  });
});
