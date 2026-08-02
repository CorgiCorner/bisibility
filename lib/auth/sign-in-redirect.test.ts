import { describe, expect, it } from "vitest";
import { signInRedirectUrl } from "./sign-in-redirect";

const origin = "https://rank.example.com";

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

  it("preserves a validated OAuth consent destination for the second factor", () => {
    const returnTo =
      "/oauth/consent?client_id=client_1&redirect_uri=http%3A%2F%2F127.0.0.1%3A51008%2Fcallback&scope=openid";

    expect(signInRedirectUrl({ data: { twoFactorRedirect: true } }, origin, returnTo)).toBe(
      `${origin}/two-factor?next=%2Foauth%2Fconsent%3Fclient_id%3Dclient_1%26redirect_uri%3Dhttp%253A%252F%252F127.0.0.1%253A51008%252Fcallback%26scope%3Dopenid`,
    );
  });

  it.each(["https://evil.example.com", "//evil.example.com"])(
    "drops the unsafe second-factor destination %s",
    (returnTo) => {
      expect(signInRedirectUrl({ data: { twoFactorRedirect: true } }, origin, returnTo)).toBe(
        `${origin}/two-factor`,
      );
    },
  );

  it.each([undefined, "/app"])(
    "omits the default destination from the second-factor URL",
    (returnTo) => {
      expect(signInRedirectUrl({ data: { twoFactorRedirect: true } }, origin, returnTo)).toBe(
        `${origin}/two-factor`,
      );
    },
  );

  it("preserves supported explicit redirects and rejects unsafe schemes", () => {
    expect(signInRedirectUrl({ data: { redirect: true, url: "/oauth/consent" } }, origin)).toBe(
      `${origin}/oauth/consent`,
    );
    expect(
      signInRedirectUrl({ data: { redirect: true, url: "javascript:alert(1)" } }, origin),
    ).toBeNull();
  });
});
