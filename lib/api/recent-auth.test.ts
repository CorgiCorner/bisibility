import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { PersonalTokenAuth } from "./auth";
import { recentAppAuthenticationResponse, requiresRecentAppAuthentication } from "./recent-auth";

const NOW = new Date("2026-10-18T12:00:00.000Z");

function personal(overrides: Partial<PersonalTokenAuth> = {}): PersonalTokenAuth {
  return {
    kind: "personal_token",
    memberships: [],
    token: {
      id: "t",
      name: "t",
      prefix: "p",
      publicId: null,
      scopes: ["read", "write"],
      userId: "u",
    },
    user: { email: "user@example.com", id: "u", name: "User", publicId: null },
    ...overrides,
  };
}

const url = new URL("https://api.example.com/api/v1/me");

describe("recent sign-in for destructive app operations", () => {
  it("applies only to account deletion", () => {
    expect(requiresRecentAppAuthentication("DELETE", ["me"])).toBe(true);
    expect(requiresRecentAppAuthentication("GET", ["me"])).toBe(false);
    expect(requiresRecentAppAuthentication("DELETE", ["me", "tokens", "x"])).toBe(false);
  });

  it("leaves personal access tokens and MCP grants to their scopes", () => {
    for (const auth of [personal(), personal({ oauthClientId: "custom-client" })]) {
      expect(
        recentAppAuthenticationResponse(auth, "DELETE", ["me"], new Headers(), url),
      ).toBeNull();
    }
  });

  it.each([
    ["a sign-in from five minutes ago", new Date(NOW.getTime() - 5 * 60_000), null],
    ["a sign-in from eleven minutes ago", new Date(NOW.getTime() - 11 * 60_000), 403],
    ["an unknown sign-in time", null, 403],
    ["a sign-in two minutes in the future", new Date(NOW.getTime() + 120_000), 403],
  ])("for an app token with %s returns %s", (_label, authTime, status) => {
    vi.useFakeTimers({ now: NOW });
    try {
      const auth = personal({ authTime, oauthClientId: "bisibility-ios" });
      const response = recentAppAuthenticationResponse(auth, "DELETE", ["me"], new Headers(), url);
      expect(response?.status ?? null).toBe(status);
    } finally {
      vi.useRealTimers();
    }
  });
});
