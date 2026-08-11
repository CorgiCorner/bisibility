/**
 * The install route used to reissue state and overwrite the cookie on every hit, so a prefetch
 * or a second click during consent invalidated the flow the user was already completing. These
 * tests drive both routes against one shared cookie jar, the way a browser would.
 */
import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as callbackGet } from "./callback/route";
import { GET as installGet } from "./install/route";

const cookieJar = new Map<string, string>();

const mocks = vi.hoisted(() => ({
  exchangeGoogleCode: vi.fn(),
  getActionActor: vi.fn(),
  requireProjectScope: vi.fn(),
  storePendingGoogleOAuth: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    delete: (name: string) => cookieJar.delete(name),
    get: (name: string) => (cookieJar.has(name) ? { value: cookieJar.get(name) } : undefined),
    set: (name: string, value: string) => cookieJar.set(name, value),
  }),
}));
vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: mocks.getActionActor,
  requireProjectScope: mocks.requireProjectScope,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { providerConnection: { findUnique: vi.fn().mockResolvedValue(null) } },
}));
// Reversible stand-in for the real envelope: state round-trips, garbage still fails to parse.
vi.mock("@/lib/providers/crypto", () => ({
  decryptProviderCredentials: () => ({}),
  decryptSecret: (raw: string) =>
    Buffer.from(raw.replace(/^enc:/, ""), "base64url").toString("utf8"),
  encryptSecret: (value: string) => `enc:${Buffer.from(value, "utf8").toString("base64url")}`,
}));
vi.mock("@/lib/providers/analytics/google-client", () => ({
  exchangeGoogleCode: mocks.exchangeGoogleCode,
  GOOGLE_AUTHORIZE_URL: "https://accounts.google.test/authorize",
  googleAnalyticsScopes: () => ["openid", "webmasters"],
  googleClientId: () => "client_id",
  googleRedirectUri: () => "https://app.example.com/api/integrations/google/callback",
}));
vi.mock("@/lib/providers/analytics/google-oauth-pending", () => ({
  storePendingGoogleOAuth: mocks.storePendingGoogleOAuth,
}));

const projectId = "prj_a00000000000000000000000";
const origin = "https://app.example.com";

function applySetCookie(response: Response) {
  const header = response.headers.get("set-cookie");
  if (!header) return false;
  const [pair] = header.split(";");
  const separator = pair?.indexOf("=") ?? -1;
  if (!pair || separator < 0) return false;
  // Next serializes cookie values percent-encoded and decodes them again on read.
  cookieJar.set(pair.slice(0, separator), decodeURIComponent(pair.slice(separator + 1)));
  return true;
}

async function installHit(query = `projectId=${projectId}&provider=gsc`) {
  const response = await installGet(
    new Request(`${origin}/api/integrations/google/install?${query}`) as NextRequest,
  );
  const wroteCookie = applySetCookie(response);
  const location = new URL(response.headers.get("location") ?? "");
  return { location, state: location.searchParams.get("state") ?? "", wroteCookie };
}

function callbackHit(state: string) {
  return callbackGet(
    new Request(
      `${origin}/api/integrations/google/callback?code=code_1&state=${encodeURIComponent(state)}`,
    ) as NextRequest,
  );
}

describe("Google OAuth install state across repeated hits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieJar.clear();
    vi.stubEnv("SITE_URL", origin);
    mocks.getActionActor.mockResolvedValue({ id: "user_1" });
    mocks.requireProjectScope.mockResolvedValue({ id: "project_1", publicId: projectId });
    mocks.exchangeGoogleCode.mockResolvedValue({ refreshToken: "refresh_token" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("completes the first flow after a second install hit reuses its state", async () => {
    const first = await installHit();
    expect(first.state).not.toBe("");
    expect(first.wroteCookie).toBe(true);

    const second = await installHit();
    expect(second.state).toBe(first.state);
    // Reuse must leave the live cookie (and its original expiry) alone.
    expect(second.wroteCookie).toBe(false);
    expect(cookieJar.get("google_oauth_state")).toBe(first.state);

    const response = await callbackHit(first.state);

    expect(response.headers.get("location")).toBe(
      `${origin}/app/${projectId}/integrations?google=select&connect=gsc&provider=gsc`,
    );
    expect(mocks.requireProjectScope.mock.calls.map((call) => call[2])).toEqual([
      projectId,
      projectId,
      projectId,
    ]);
    expect(mocks.storePendingGoogleOAuth).toHaveBeenCalledTimes(1);
  });

  it("still refuses a state the browser never carried", async () => {
    const { state } = await installHit();
    cookieJar.clear();

    const response = await callbackHit(state);

    expect(response.headers.get("location")).toContain("google=error");
    expect(response.headers.get("location")).toContain("reason=state_cookie_mismatch");
    expect(mocks.storePendingGoogleOAuth).not.toHaveBeenCalled();
  });

  it("returns a declined consent to the surface the install started from", async () => {
    const { state } = await installHit();

    const response = await callbackGet(
      new Request(
        `${origin}/api/integrations/google/callback?error=access_denied&state=${encodeURIComponent(state)}`,
      ) as NextRequest,
    );

    expect(response.headers.get("location")).toBe(
      `${origin}/app/${projectId}/integrations?google=error&connect=gsc&provider=gsc&reason=google_denied`,
    );
  });

  it("mints fresh state for a different provider on the same project", async () => {
    const first = await installHit();
    const second = await installHit(`projectId=${projectId}&provider=ga4`);

    expect(second.state).not.toBe(first.state);
    expect(second.wroteCookie).toBe(true);
  });
});
