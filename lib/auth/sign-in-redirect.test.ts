import { describe, expect, it } from "vitest";
import { signInRedirectUrl } from "./sign-in-redirect";

const origin = "https://rank.example";

describe("signInRedirectUrl", () => {
  it("routes a pending second factor to the dedicated challenge", () => {
    expect(
      signInRedirectUrl(
        {
          data: {
            twoFactorMethods: ["totp"],
            twoFactorRedirect: true,
          },
        },
        origin,
      ),
    ).toBe(`${origin}/two-factor`);
  });

  it("preserves supported explicit redirects and rejects unsafe schemes", () => {
    expect(signInRedirectUrl({ data: { redirect: true, url: "/oauth/consent" } }, origin)).toBe(
      `${origin}/oauth/consent`,
    );
    expect(
      signInRedirectUrl({ data: { redirect: true, url: "javascript:alert(1)" } }, origin),
    ).toBeNull();
  });
});
