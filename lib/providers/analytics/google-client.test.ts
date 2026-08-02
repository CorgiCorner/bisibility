import { resetRateLimitStateForTests } from "@/lib/api/ratelimit";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import {
  clearProviderRateLimitState,
  consumeProviderLimit,
  ProviderRateLimitedError,
  readCooldown,
} from "@/lib/providers/rate-limit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type GoogleFetchContext,
  googleApiFetch,
  isGoogleOAuthConfigured,
  listGa4Properties,
  refreshGoogleAccessToken,
} from "./google-client";

const context: GoogleFetchContext = { accountKey: "gsc:test-account", providerId: "gsc" };

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    json: () => Promise.resolve(body),
    ok: init.ok ?? true,
    status: init.status ?? 200,
  } as Response;
}

describe("googleApiFetch provider gating", () => {
  beforeEach(() => {
    resetRateLimitStateForTests();
    clearProviderRateLimitState();
    process.env.REDIS_URL = "";
    process.env.BISIBILITY_PROVIDER_RATE_LIMIT_DISABLED = "";
    process.env.BISIBILITY_PROVIDER_RATE_LIMIT_GSC_PER_MINUTE = "";
    process.env.GOOGLE_CLIENT_ID = "client";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defers without calling fetch when the account budget is exhausted", async () => {
    process.env.BISIBILITY_PROVIDER_RATE_LIMIT_GSC_PER_MINUTE = "1";
    await consumeProviderLimit("gsc", undefined, { accountKey: context.accountKey });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      googleApiFetch("https://example.test/x", "token", {}, context),
    ).rejects.toBeInstanceOf(ProviderRateLimitedError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("maps a 429 response to a deferral and writes a cooldown", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 429 })));

    const rejection = googleApiFetch("https://example.test/x", "token", {}, context);
    await expect(rejection).rejects.toMatchObject({
      source: "provider",
    });
    expect(readCooldown(context.accountKey)?.until).toBeGreaterThan(Date.now());
  });

  it.each([
    [{ error: { errors: [{ reason: "rateLimitExceeded" }] } }, "minute"],
    [{ error: { errors: [{ reason: "dailyLimitExceeded" }] } }, "daily"],
    [{ error: { status: "RESOURCE_EXHAUSTED" } }, "unknown"],
  ] as const)("classifies Google 429 payload %j as %s scope", async (payload, scope) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(payload, { ok: false, status: 429 })),
    );

    await expect(
      googleApiFetch("https://example.test/x", "token", {}, context),
    ).rejects.toMatchObject({ scope, source: "provider" });
  });

  it("maps invalid_grant token refresh responses to a typed authorization error", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { error: "invalid_grant", error_description: "Token has been revoked" },
            { ok: false, status: 400 },
          ),
        ),
    );

    await expect(refreshGoogleAccessToken("refresh-token")).rejects.toBeInstanceOf(
      ProviderAuthError,
    );
  });

  it("persists a rotated refresh token before returning the access token", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ access_token: "access-token", refresh_token: "rotated-token" }),
        ),
    );
    const persist = vi.fn().mockResolvedValue(undefined);

    await expect(refreshGoogleAccessToken("old-token", persist)).resolves.toBe("access-token");
    expect(persist).toHaveBeenCalledWith("rotated-token");
  });

  it("does not write credentials when Google returns no rotated refresh token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ access_token: "access" })));
    const persist = vi.fn().mockResolvedValue(undefined);

    await refreshGoogleAccessToken("current-token", persist);

    expect(persist).not.toHaveBeenCalled();
  });

  it("keeps a valid provider response successful when rotation persistence fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ access_token: "access-token", refresh_token: "rotated-token" }),
        ),
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const persist = vi.fn().mockRejectedValue(new Error("database unavailable"));

    await expect(refreshGoogleAccessToken("old-token", persist)).resolves.toBe("access-token");
    expect(consoleError).toHaveBeenCalledWith("[google] rotated refresh token persistence failed", {
      errorClass: "credential_persistence",
    });
  });

  it("maps Google API 401 responses to a typed authorization error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 401 })));

    await expect(
      googleApiFetch("https://example.test/x", "token", {}, context),
    ).rejects.toBeInstanceOf(ProviderAuthError);
  });

  it("keeps non-authorization Google failures generic", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 500 })));

    const rejection = googleApiFetch("https://example.test/x", "token", {}, context);
    await expect(rejection).rejects.toThrow("status 500");
    await expect(rejection).rejects.not.toBeInstanceOf(ProviderAuthError);
  });

  it("passes through and returns the payload when not throttled", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ rows: [1, 2] })));

    const result = await googleApiFetch<{ rows: number[] }>(
      "https://example.test/x",
      "token",
      {},
      context,
    );
    expect(result.rows).toEqual([1, 2]);
  });

  it("checks Google OAuth env without throwing", () => {
    const previousId = process.env.GOOGLE_CLIENT_ID;
    const previousSecret = process.env.GOOGLE_CLIENT_SECRET;
    try {
      process.env.GOOGLE_CLIENT_ID = "client";
      process.env.GOOGLE_CLIENT_SECRET = "secret";
      expect(isGoogleOAuthConfigured()).toBe(true);

      process.env.GOOGLE_CLIENT_SECRET = "";
      expect(isGoogleOAuthConfigured()).toBe(false);
    } finally {
      if (previousId === undefined) Reflect.deleteProperty(process.env, "GOOGLE_CLIENT_ID");
      else process.env.GOOGLE_CLIENT_ID = previousId;
      if (previousSecret === undefined) Reflect.deleteProperty(process.env, "GOOGLE_CLIENT_SECRET");
      else process.env.GOOGLE_CLIENT_SECRET = previousSecret;
    }
  });
});

describe("listGa4Properties", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists every GA4 property from paginated account summaries", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          accountSummaries: [
            {
              displayName: "CorgiCorner",
              propertySummaries: [{ displayName: "bisibility", property: "properties/123456789" }],
            },
          ],
          nextPageToken: "page-2",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          accountSummaries: [
            {
              displayName: "Example",
              propertySummaries: [{ displayName: "Example Web", property: "properties/987654321" }],
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listGa4Properties("access-token")).resolves.toEqual([
      {
        accountDisplayName: "CorgiCorner",
        displayName: "bisibility",
        propertyId: "123456789",
      },
      {
        accountDisplayName: "Example",
        displayName: "Example Web",
        propertyId: "987654321",
      },
    ]);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("pageToken=page-2");
  });
});
