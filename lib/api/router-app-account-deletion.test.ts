vi.mock("./router", async (importOriginal) =>
  (await import("./response-capture.test-support")).captureRouter(await importOriginal()),
);

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PersonalTokenAuth } from "./auth";

const mocks = vi.hoisted(() => ({
  authenticateBearer: vi.fn(),
  deleteAccountRecords: vi.fn(),
  findOAuthToken: vi.fn(),
  issuePersonalToken: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("./auth", () => ({
  ApiAuthError: class extends Error {},
  authenticateBearer: mocks.authenticateBearer,
  LEGACY_BEARER_PREFIXES: [],
  PERSONAL_TOKEN_PREFIX: "bsb_pat_live_",
  PROJECT_API_KEY_PREFIX: "bsb_key_live_",
}));
vi.mock("@/lib/achievements/api", () => ({
  withPracticeRequest: (_input: unknown, _operation: string, run: () => unknown) => run(),
}));
vi.mock("@/lib/account/account-deletion", () => ({
  AccountDeletionConfirmationError: class extends Error {},
  deleteAccountRecords: mocks.deleteAccountRecords,
  LastInstanceAdminDeletionError: class extends Error {},
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { oauthAccessToken: { findUnique: mocks.findOAuthToken } },
}));
vi.mock("@/lib/auth/oauth-consent-guard", () => ({
  allowedOAuthTokenScopes: (_client: string, scopes: string[]) => Promise.resolve(scopes),
}));
vi.mock("./pat-service", () => ({ issuePersonalToken: mocks.issuePersonalToken }));
vi.mock("./ratelimit", () => ({
  checkRateLimit: () => Promise.resolve({ headers: new Headers(), success: true }),
}));
vi.mock("./idempotency", () => ({
  withIdempotency: (_input: unknown, run: () => unknown) => run(),
}));

import { handleApiRequest } from "./router";

const NOW = new Date("2026-10-18T12:00:00.000Z");
function auth(
  scopes: PersonalTokenAuth["token"]["scopes"],
  authTime: Date | null,
  oauthClientId?: string,
): PersonalTokenAuth {
  return {
    authTime,
    kind: "personal_token",
    memberships: [],
    oauthClientId,
    token: { id: "token_1", name: "App", prefix: "p", publicId: null, scopes, userId: "user_1" },
    user: { email: "owner@example.test", id: "user_1", name: "Owner", publicId: null },
  };
}
function request(method: string, path = "me") {
  return new Request(`https://example.test/api/v1/${path}`, {
    body: JSON.stringify({ confirm_email: "owner@example.test" }),
    headers: { authorization: "Bearer opaque-app-token", "content-type": "application/json" },
    method,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: NOW });
  mocks.deleteAccountRecords.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe("app account deletion through the real router", () => {
  it.each([0, 5 * 60_000, 10 * 60_000])(
    "accepts api:write with a sign-in %s ms ago",
    async (age) => {
      mocks.authenticateBearer.mockResolvedValue(
        auth(["read", "write"], new Date(NOW.getTime() - age), "bisibility-ios"),
      );
      const response = await handleApiRequest(request("DELETE"), ["me"]);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ deleted: true });
      expect(mocks.deleteAccountRecords).toHaveBeenCalledWith({
        confirmEmail: "owner@example.test",
        source: "api",
        userId: "user_1",
      });
    },
  );

  it.each([new Date(NOW.getTime() - 600_001), null])(
    "rejects stale or missing authentication %s before deletion",
    async (authTime) => {
      mocks.authenticateBearer.mockResolvedValue(
        auth(["read", "write"], authTime, "bisibility-ios"),
      );
      const response = await handleApiRequest(request("DELETE"), ["me"]);
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        details: { code: "reauthentication_required", max_age_seconds: 600 },
      });
      expect(mocks.deleteAccountRecords).not.toHaveBeenCalled();
    },
  );

  it("refuses api:read even with fresh authentication", async () => {
    mocks.authenticateBearer.mockResolvedValue(auth(["read"], NOW, "bisibility-ios"));
    expect((await handleApiRequest(request("DELETE"), ["me"])).status).toBe(403);
    expect(mocks.deleteAccountRecords).not.toHaveBeenCalled();
  });

  it.each([
    ["write", 403],
    ["admin", 200],
  ] as const)("retains the personal-token %s scope rule", async (scope, status) => {
    mocks.authenticateBearer.mockResolvedValue(auth([scope], null));
    expect((await handleApiRequest(request("DELETE"), ["me"])).status).toBe(status);
    expect(mocks.deleteAccountRecords).toHaveBeenCalledTimes(status === 200 ? 1 : 0);
  });

  it("refuses app-token exchange for a personal token, even with a retained tokens:write scope", async () => {
    mocks.findOAuthToken.mockResolvedValue({
      clientId: "bisibility-ios",
      expiresAt: new Date(NOW.getTime() + 60_000),
      scopes: ["api:write", "tokens:write"],
      userId: "user_1",
    });
    const response = await handleApiRequest(request("POST", "me/tokens"), ["me", "tokens"]);
    expect(response.status).toBe(403);
    expect(mocks.issuePersonalToken).not.toHaveBeenCalled();
    expect(mocks.authenticateBearer).not.toHaveBeenCalled();
  });
});
