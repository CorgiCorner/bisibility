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

  it("carries the signed OAuth authorize request to the second factor", () => {
    const oauthSearch =
      "?client_id=client_1&redirect_uri=http%3A%2F%2F127.0.0.1%3A51008%2Fcallback&state=s1" +
      "&ba_param=ba_param&ba_param=client_id&ba_param=redirect_uri&ba_param=state" +
      "&sig=signature&unsigned=dropped";

    const target = new URL(
      signInRedirectUrl({ data: { twoFactorRedirect: true } }, origin, "/app", oauthSearch) ?? "",
    );

    expect(target.pathname).toBe("/two-factor");
    expect(target.searchParams.get("client_id")).toBe("client_1");
    expect(target.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:51008/callback");
    expect(target.searchParams.get("state")).toBe("s1");
    expect(target.searchParams.getAll("ba_param")).toEqual([
      "ba_param",
      "client_id",
      "redirect_uri",
      "state",
    ]);
    expect(target.searchParams.get("sig")).toBe("signature");
    expect(target.searchParams.has("unsigned")).toBe(false);
    expect(target.searchParams.has("next")).toBe(false);
  });

  it("keeps an explicit destination next to the signed OAuth request", () => {
    const target = new URL(
      signInRedirectUrl(
        { data: { twoFactorRedirect: true } },
        origin,
        "/app/settings",
        "?client_id=client_1&ba_param=ba_param&ba_param=client_id&sig=signature",
      ) ?? "",
    );

    expect(target.searchParams.get("next")).toBe("/app/settings");
    expect(target.searchParams.get("client_id")).toBe("client_1");
    expect(target.searchParams.get("sig")).toBe("signature");
  });

  it.each([
    "?client_id=client_1&scope=openid",
    "?client_id=client_1&sig=signature",
    "?ba_param=client_id&client_id=client_1",
  ])("ignores a query that is not a signed OAuth request: %s", (oauthSearch) => {
    expect(
      signInRedirectUrl({ data: { twoFactorRedirect: true } }, origin, undefined, oauthSearch),
    ).toBe(`${origin}/two-factor`);
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
