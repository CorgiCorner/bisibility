import { clearProviderRateLimitState } from "@/lib/providers/rate-limit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readGa4KeyEventsConfigured } from "./ga4-admin";

const token = { access_token: "access_token" };

function credentials() {
  return { apiKey: "refresh_token", login: "123456789" };
}

describe("GA4 Admin key events", () => {
  beforeEach(() => {
    clearProviderRateLimitState();
    vi.stubEnv("BISIBILITY_PROVIDER_RATE_LIMIT_DISABLED", "1");
    vi.stubEnv("GOOGLE_CLIENT_ID", "client_id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "client_secret");
  });

  afterEach(() => {
    clearProviderRateLimitState();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses the v1alpha key events endpoint for the configured property", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).includes("oauth2.googleapis.com/token")) return Response.json(token);
        return Response.json({ keyEvents: [{ name: "properties/123456789/keyEvents/1" }] });
      }),
    );

    await expect(readGa4KeyEventsConfigured(credentials())).resolves.toBe(true);

    const call = vi.mocked(fetch).mock.calls.find(([url]) => String(url).includes("/keyEvents"));
    expect(call?.[0]).toBe(
      "https://analyticsadmin.googleapis.com/v1alpha/properties/123456789/keyEvents",
    );
  });

  it("returns false when the successful listing is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).includes("oauth2.googleapis.com/token")) return Response.json(token);
        return Response.json({ keyEvents: [] });
      }),
    );

    await expect(readGa4KeyEventsConfigured(credentials())).resolves.toBe(false);
  });

  it("returns null for an HTTP 403", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).includes("oauth2.googleapis.com/token")) return Response.json(token);
        return Response.json({ error: { message: "forbidden" } }, { status: 403 });
      }),
    );

    await expect(readGa4KeyEventsConfigured(credentials())).resolves.toBeNull();
  });

  it("returns null for a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).includes("oauth2.googleapis.com/token")) return Response.json(token);
        throw new TypeError("network unavailable");
      }),
    );

    await expect(readGa4KeyEventsConfigured(credentials())).resolves.toBeNull();
  });

  it("returns null for a malformed listing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).includes("oauth2.googleapis.com/token")) return Response.json(token);
        return Response.json({ keyEvents: {} });
      }),
    );

    await expect(readGa4KeyEventsConfigured(credentials())).resolves.toBeNull();
  });

  it("returns null when credentials are missing", async () => {
    await expect(readGa4KeyEventsConfigured({ login: "123456789" })).resolves.toBeNull();
  });
});
