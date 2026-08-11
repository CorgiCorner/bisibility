import { describe, expect, it } from "vitest";
import { googleOAuthErrorCopy } from "./google-oauth-copy";
import { GOOGLE_OAUTH_FAILURE_REASONS } from "./google-oauth-failure";

const FALLBACK = "Google connection wasn't completed. Try again with the account that owns.";

describe("googleOAuthErrorCopy", () => {
  it("blames the flow, not the account, when the state cookie is gone or stale", () => {
    for (const reason of ["state_cookie_mismatch", "state_expired"]) {
      expect(googleOAuthErrorCopy(reason, FALLBACK)).toBe(
        "The sign-in flow expired or was restarted. Try again once, in a single tab.",
      );
    }
  });

  it("owns a server-side failure instead of sending the user after a permission problem", () => {
    for (const reason of ["store_failed", "token_exchange"]) {
      expect(googleOAuthErrorCopy(reason, FALLBACK)).toBe(
        "Google sign-in worked but our server could not finish the connection. This is on us - retry, and contact us if it repeats.",
      );
    }
  });

  it("keeps the remove-access remedy for a missing refresh token", () => {
    expect(googleOAuthErrorCopy("no_refresh_token", FALLBACK)).toBe(
      "Google did not return a refresh token. Remove app access and reconnect.",
    );
  });

  it("reports a declined consent as Google's decision", () => {
    expect(googleOAuthErrorCopy("google_denied", FALLBACK)).toBe(
      "Google reported the connection was declined.",
    );
  });

  it("names the bisibility session, not the Google account, for an actor mismatch", () => {
    const copy = googleOAuthErrorCopy("actor_mismatch", FALLBACK);

    expect(copy).toContain("different bisibility account");
    expect(copy).not.toBe(FALLBACK);
  });

  it.each([undefined, null, "", "not_a_reason", "../etc/passwd"])(
    "falls back to the caller's generic copy for %s",
    (reason) => {
      expect(googleOAuthErrorCopy(reason, FALLBACK)).toBe(FALLBACK);
    },
  );

  it("never leaks an empty message for a known reason", () => {
    for (const reason of GOOGLE_OAUTH_FAILURE_REASONS) {
      expect(googleOAuthErrorCopy(reason, FALLBACK).length).toBeGreaterThan(0);
    }
  });
});
