import type { ProviderCredentials } from "@/lib/providers/types";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

let analytics: typeof import("./gsc-search-analytics");
const credentials = (): ProviderCredentials => ({
  apiKey: "fixture-refresh",
  login: "sc-domain:example.com",
  tokenCacheIdentity: { connectionId: "connection_1", credentialVersion: "version_1" },
});
const query = { startDate: "2026-10-01", endDate: "2026-10-28" };

it("invalidates a 401 even when the payload carries a non-auth reason", async () => {
  const fetchMock = vi.fn(async (url: string) =>
    url.includes("oauth2.googleapis.com")
      ? Response.json({ access_token: "fixture-access", expires_in: 3600 })
      : Response.json({ error: { errors: [{ reason: "forbidden" }] } }, { status: 401 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const client = await import("./google-client");
  await client.refreshGoogleAccessToken(
    "fixture-refresh",
    undefined,
    undefined,
    credentials().tokenCacheIdentity,
  );
  await expect(
    client.googleApiFetch("https://example.com/read", "fixture-access"),
  ).rejects.toMatchObject({ status: 401, reason: "permission" });
  await client.refreshGoogleAccessToken(
    "fixture-refresh",
    undefined,
    undefined,
    credentials().tokenCacheIdentity,
  );
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("GOOGLE_CLIENT_ID", "fixture-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "fixture-secret");
  vi.stubEnv("BISIBILITY_PROVIDER_RATE_LIMIT_DISABLED", "1");
  analytics = await import("./gsc-search-analytics");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("does not retry data after invalid_grant on the renewed exchange", async () => {
  let exchanges = 0;
  const fetchMock = vi.fn(async (url: string) => {
    if (!url.includes("oauth2.googleapis.com")) return Response.json({}, { status: 401 });
    return ++exchanges === 1
      ? Response.json({ access_token: "fixture-access", expires_in: 3600 })
      : Response.json({ error: "invalid_grant" }, { status: 400 });
  });
  vi.stubGlobal("fetch", fetchMock);
  await expect(
    analytics.fetchSearchAnalyticsEnvelope({ credentials: credentials(), ...query }),
  ).rejects.toMatchObject({ name: "ProviderAuthError", code: "invalid_grant" });
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it("consumes the provider budget again before retrying a rejected read", async () => {
  vi.stubEnv("BISIBILITY_PROVIDER_RATE_LIMIT_DISABLED", "");
  vi.stubEnv("BISIBILITY_PROVIDER_RATE_LIMIT_GSC_PER_MINUTE", "1");
  vi.stubEnv("REDIS_URL", "");
  const fetchMock = vi.fn(async (url: string) =>
    url.includes("oauth2.googleapis.com")
      ? Response.json({ access_token: "fixture-access", expires_in: 3600 })
      : Response.json({}, { status: 401 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  await expect(
    analytics.fetchSearchAnalyticsEnvelope({ credentials: credentials(), ...query }),
  ).rejects.toMatchObject({ name: "ProviderRateLimitedError" });
  expect(
    fetchMock.mock.calls.filter(([url]) => !url.includes("oauth2.googleapis.com")),
  ).toHaveLength(1);
});

it("checks an already cancelled read before a cache hit and starts no data request", async () => {
  const fetchMock = vi.fn(async (url: string) =>
    Response.json(
      url.includes("oauth2.googleapis.com")
        ? { access_token: "fixture-access", expires_in: 3600 }
        : { rows: [] },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  await analytics.fetchSearchAnalyticsEnvelope({ credentials: credentials(), ...query });
  const abort = new AbortController();
  abort.abort();
  await expect(
    analytics.fetchSearchAnalyticsEnvelope({
      credentials: credentials(),
      ...query,
      signal: abort.signal,
    }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("shares one exchange across parallel period reads from the same connection", async () => {
  const fetchMock = vi.fn(async (url: string) =>
    Response.json(
      url.includes("oauth2.googleapis.com")
        ? { access_token: "fixture-access", expires_in: 3600 }
        : { rows: [] },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  await Promise.all([
    analytics.fetchSearchAnalyticsEnvelope({ credentials: credentials(), ...query }),
    analytics.fetchSearchAnalyticsEnvelope({ credentials: credentials(), ...query }),
  ]);
  expect(
    fetchMock.mock.calls.filter(([url]) => url.includes("oauth2.googleapis.com")),
  ).toHaveLength(1);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it("refreshes a rejected token once and recovers without reauth", async () => {
  let exchanges = 0;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("oauth2.googleapis.com"))
      return Response.json({ access_token: `access-${++exchanges}`, expires_in: 3600 });
    return new Headers(init?.headers).get("Authorization") === "Bearer access-1"
      ? Response.json({}, { status: 401 })
      : Response.json({ rows: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
  await expect(
    analytics.fetchSearchAnalyticsEnvelope({ credentials: credentials(), ...query }),
  ).resolves.toEqual({ rows: [] });
  await analytics.fetchSearchAnalyticsEnvelope({ credentials: credentials(), ...query });
  expect(exchanges).toBe(2);
  expect(fetchMock).toHaveBeenCalledTimes(5);
});

it("propagates renewed auth failure after exactly one safe retry and evicts it", async () => {
  let exchanges = 0;
  const fetchMock = vi.fn(async (url: string) =>
    url.includes("oauth2.googleapis.com")
      ? Response.json({ access_token: `access-${++exchanges}`, expires_in: 3600 })
      : Response.json({}, { status: 401 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  await expect(
    analytics.fetchSearchAnalyticsEnvelope({ credentials: credentials(), ...query }),
  ).rejects.toMatchObject({ name: "ProviderAuthError" });
  expect(exchanges).toBe(2);
  expect(fetchMock).toHaveBeenCalledTimes(4);
  const client = await import("./google-client");
  await client.refreshGoogleAccessToken(
    "fixture-refresh",
    undefined,
    undefined,
    credentials().tokenCacheIdentity,
  );
  expect(exchanges).toBe(3);
});

it("never evicts a newer token when an older in-flight request returns 401", async () => {
  let exchanges = 0;
  let rejectOld = () => {};
  let oldStarted = () => {};
  const started = new Promise<void>((resolve) => {
    oldStarted = resolve;
  });
  let oldRequests = 0;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("oauth2.googleapis.com"))
      return Response.json({ access_token: `access-${++exchanges}`, expires_in: 3600 });
    if (new Headers(init?.headers).get("Authorization") === "Bearer access-1") {
      if (++oldRequests === 1)
        return new Promise<Response>((resolve) => {
          rejectOld = () => resolve(Response.json({}, { status: 401 }));
          oldStarted();
        });
      return Response.json({}, { status: 401 });
    }
    return Response.json({ rows: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
  const first = analytics.fetchSearchAnalyticsEnvelope({ credentials: credentials(), ...query });
  await started;
  await analytics.fetchSearchAnalyticsEnvelope({ credentials: credentials(), ...query });
  rejectOld();
  await first;
  expect(exchanges).toBe(2);
});

it.each([403, 429, 500])("does not evict or retry a non-auth %s failure", async (status) => {
  const fetchMock = vi.fn(async (url: string) =>
    url.includes("oauth2.googleapis.com")
      ? Response.json({ access_token: "fixture-access", expires_in: 3600 })
      : Response.json({}, { status }),
  );
  vi.stubGlobal("fetch", fetchMock);
  await expect(
    analytics.fetchSearchAnalyticsEnvelope({ credentials: credentials(), ...query }),
  ).rejects.toBeInstanceOf(Error);
  const client = await import("./google-client");
  await client.refreshGoogleAccessToken(
    "fixture-refresh",
    undefined,
    undefined,
    credentials().tokenCacheIdentity,
  );
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("never retries arbitrary mutating API calls", async () => {
  const fetchMock = vi.fn(async () => Response.json({}, { status: 401 }));
  vi.stubGlobal("fetch", fetchMock);
  const client = await import("./google-client");
  await expect(
    client.googleApiFetch("https://example.com/mutate", "fixture-access", { method: "POST" }),
  ).rejects.toMatchObject({ name: "ProviderAuthError" });
  expect(fetchMock).toHaveBeenCalledOnce();
});

it("keeps a batch session reusable after its initial token expires at the provider", async () => {
  let exchanges = 0;
  let rejectInitial = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("oauth2.googleapis.com"))
        return Response.json({ access_token: `access-${++exchanges}`, expires_in: 3600 });
      return rejectInitial && new Headers(init?.headers).get("Authorization") === "Bearer access-1"
        ? Response.json({}, { status: 401 })
        : Response.json({ rows: [] });
    }),
  );
  const session = await analytics.createGscSearchAnalyticsSession(credentials());
  await session.fetchEnvelope(query);
  rejectInitial = true;
  await expect(session.fetchEnvelope(query)).resolves.toEqual({ rows: [] });
  await session.fetchEnvelope(query);
  expect(exchanges).toBe(2);
});

it.each([false, true])(
  "preserves the session abort signal through auth retry: %s",
  async (retry) => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("oauth2.googleapis.com"))
        return Response.json({ access_token: "fixture-access", expires_in: 3600 });
      if (retry) {
        controller.abort();
        return Response.json({}, { status: 401 });
      }
      return Response.json({ rows: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const session = await analytics.createGscSearchAnalyticsSession(
      credentials(),
      controller.signal,
    );
    if (!retry) controller.abort();
    await expect(session.fetchEnvelope(query)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(retry ? 2 : 1);
  },
);
