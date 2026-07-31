import {
  OAUTH_ACCESS_TOKEN_TTL_LABEL,
  OAUTH_ACCESS_TOKEN_TTL_SECONDS,
  OAUTH_AUTHORIZATION_TTL_SECONDS,
  OAUTH_REFRESH_TOKEN_TTL_LABEL,
  OAUTH_REFRESH_TOKEN_TTL_SECONDS,
} from "@/lib/auth/oauth-policy";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOAuthConsentClient } from "./oauth-consent";

const mocks = vi.hoisted(() => ({
  prisma: {
    oauthClient: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

describe("getOAuthConsentClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.oauthClient.findUnique.mockResolvedValue({
      clientId: "client_1",
      name: "Codex",
      redirectUris: ["http://127.0.0.1:51008/callback/request"],
    });
  });

  it("returns dynamic client metadata and a verified loopback callback", async () => {
    await expect(
      getOAuthConsentClient("client_1", "http://127.0.0.1:51008/callback/request"),
    ).resolves.toEqual({
      dynamic: true,
      id: "client_1",
      name: "Codex",
      redirectUri: "127.0.0.1:51008/callback/request",
    });
  });

  it("marks the seeded CLI client as registered", async () => {
    mocks.prisma.oauthClient.findUnique.mockResolvedValue({
      clientId: "bisibility-cli",
      name: "Bisibility CLI",
      redirectUris: ["http://127.0.0.1/callback"],
    });

    await expect(
      getOAuthConsentClient("bisibility-cli", "http://127.0.0.1:51999/callback"),
    ).resolves.toMatchObject({
      dynamic: false,
      redirectUri: "127.0.0.1:51999/callback",
    });
  });

  it("does not display an unregistered redirect target", async () => {
    await expect(
      getOAuthConsentClient("client_1", "https://attacker.example.com/callback"),
    ).resolves.toMatchObject({ redirectUri: null });
  });

  it("returns a safe fallback for an unknown client", async () => {
    mocks.prisma.oauthClient.findUnique.mockResolvedValue(null);

    await expect(getOAuthConsentClient("missing", undefined)).resolves.toEqual({
      dynamic: true,
      id: "missing",
      name: "Unknown client",
      redirectUri: null,
    });
  });
});

describe("OAuth consent policy", () => {
  it("keeps request and token lifetimes aligned with the review copy", () => {
    expect(OAUTH_AUTHORIZATION_TTL_SECONDS).toBe(300);
    expect(OAUTH_ACCESS_TOKEN_TTL_SECONDS).toBe(3_600);
    expect(OAUTH_REFRESH_TOKEN_TTL_SECONDS).toBe(2_592_000);
    expect(OAUTH_ACCESS_TOKEN_TTL_LABEL).toBe("1 hour");
    expect(OAUTH_REFRESH_TOKEN_TTL_LABEL).toBe("30 days");
  });
});
