import { appRootPath } from "@/lib/routing/app-path";
import { describe, expect, it } from "vitest";
import {
  loginErrorReturnTo,
  mergeReturnToHash,
  onboardingWebsiteFromReturnTo,
  returnToOrDefault,
  validateReturnTo,
} from "./return-to";

const evilDestinations = [
  "https://evil.example/phish",
  "http://evil.example/phish",
  "//evil.example/phish",
  "///evil.example/phish",
  "/.//evil.example",
  "/a/..//evil.example",
  "/%2e//evil.example",
  String.raw`\evil.example\phish`,
  String.raw`/\evil.example/phish`,
  "/%5Cevil.example/phish",
  "javascript:alert(1)",
  "data:text/html,phish",
  " /app/settings",
  "/app/settings%ZZ",
] as const;

describe("return-to validation", () => {
  it.each(evilDestinations)("rejects unsafe destination %s", (destination) => {
    expect(validateReturnTo(destination)).toBeNull();
  });

  it("accepts relative paths and preserves their query", () => {
    expect(validateReturnTo("/app/settings?tab=access")).toBe("/app/settings?tab=access");
  });

  it("preserves a safe path, query, and fragment", () => {
    expect(validateReturnTo("/app/x?y=1#z")).toBe("/app/x?y=1#z");
  });

  it("falls back to the signed-in home for an invalid destination", () => {
    expect(returnToOrDefault("//evil.example")).toBe(appRootPath());
  });

  it("reads the exact website from a validated onboarding destination", () => {
    const website = "https://www.example.com/a path?x=1&y=<b>raw</b>";
    const destination = `/onboarding?${new URLSearchParams({ website })}`;

    expect(onboardingWebsiteFromReturnTo(destination)).toBe(website);
  });

  it("caps a remembered onboarding website at the shared safety limit", () => {
    const website = "x".repeat(2_049);
    const destination = `/onboarding?${new URLSearchParams({ website })}`;

    expect(onboardingWebsiteFromReturnTo(destination)).toBe(website.slice(0, 2_048));
  });

  it.each([
    undefined,
    "/onboarding",
    "/onboarding?website=",
    "/app?website=example.com",
    "https://evil.example/onboarding?website=example.com",
    "//evil.example/onboarding?website=example.com",
  ])("does not read a remembered website from %s", (destination) => {
    expect(onboardingWebsiteFromReturnTo(destination)).toBeNull();
  });

  it("carries the browser anchor in a query parameter", () => {
    expect(mergeReturnToHash("/app/settings?tab=access", "#api-keys")).toBe(
      "/app/settings?tab=access&section=api-keys",
    );
  });

  it.each([
    { hash: "#api-keys", value: "/app/settings" },
    { hash: "", value: "/app/settings#api-keys" },
    { hash: "#api-keys", value: "//evil.example#phish" },
  ])("never emits a fragment for $value with $hash", ({ hash, value }) => {
    expect(mergeReturnToHash(value, hash)).not.toContain("#");
  });

  it("keeps the fragment-free destination in the login query after an OAuth error", () => {
    expect(loginErrorReturnTo("/app/settings?tab=access&section=api-keys")).toBe(
      "/login?next=%2Fapp%2Fsettings%3Ftab%3Daccess%26section%3Dapi-keys",
    );
  });

  it("omits the default destination from the login URL", () => {
    expect(loginErrorReturnTo(appRootPath())).toBe("/login");
  });

  it("removes a legacy destination fragment from the OAuth error callback", () => {
    expect(loginErrorReturnTo("/app/settings#api-keys")).toBe(
      "/login?next=%2Fapp%2Fsettings%3Fsection%3Dapi-keys",
    );
  });

  it.each([
    { anchor: "#api keys", name: "spaces" },
    { anchor: "#a%0d%0aX", name: "encoded CRLF" },
    { anchor: "#javascript:x", name: "scheme-like input" },
    { anchor: `#${"a".repeat(100)}`, name: "overlong input" },
    { anchor: "#../x", name: "path traversal" },
  ])("drops anchor rejection vector: $name", ({ anchor }) => {
    expect(mergeReturnToHash("/app/settings", anchor)).toBe("/app/settings");
  });
});
