import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ consumeProviderLimit: vi.fn() }));
vi.mock("@/lib/providers/rate-limit", async (original) => ({
  ...(await original<typeof import("@/lib/providers/rate-limit")>()),
  consumeProviderLimit: mocks.consumeProviderLimit,
}));

import { googleApiFetch, refreshGoogleAccessToken } from "./google-client";
import { fetchGscQueryStats, GSC_QUERY_STATS_PAGE_SIZE } from "./gsc-query-pagination";
import { fetchSearchAnalyticsEnvelope } from "./gsc-search-analytics";

const credentials = { apiKey: "refresh-test", login: "sc-domain:example.com" };
const query = { credentials, endDate: "2026-10-28", startDate: "2026-10-01" };

describe("Google read cancellation", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
    mocks.consumeProviderLimit.mockReset().mockResolvedValue({ success: true });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("rejects an already-aborted query without refreshing credentials", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    controller.abort();
    await expect(
      fetchSearchAnalyticsEnvelope({ ...query, signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops waiting for a token request that ignores abort", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
    const controller = new AbortController();
    const pending = fetchSearchAnalyticsEnvelope({ ...query, signal: controller.signal });
    controller.abort(new DOMException("Deadline reached", "TimeoutError"));
    await expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
  });

  it("stops waiting for a response body that ignores abort", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => new Promise(() => undefined),
      }),
    );
    const controller = new AbortController();
    const pending = googleApiFetch("https://example.org/data", "test-access", {
      signal: controller.signal,
    });
    await Promise.resolve();
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("does not consume quota or dispatch when already aborted", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      googleApiFetch(
        "https://example.org/data",
        "test-access",
        {
          signal: AbortSignal.abort(),
        },
        { providerId: "gsc", accountKey: "test-account" },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.consumeProviderLimit).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bounds a quota wait and never dispatches after it resolves late", async () => {
    let release: ((gate: { success: boolean }) => void) | undefined;
    mocks.consumeProviderLimit.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const pending = googleApiFetch(
      "https://example.org/data",
      "test-access",
      { signal: controller.signal },
      { providerId: "gsc", accountKey: "test-account" },
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    release?.({ success: true });
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bounds refresh-token persistence while preserving the rotation callback", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ access_token: "test-access", refresh_token: "rotated-test" }),
        ),
    );
    let started: (() => void) | undefined;
    const persisted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const persist = vi.fn(() => {
      started?.();
      return new Promise<void>(() => undefined);
    });
    const controller = new AbortController();
    const pending = refreshGoogleAccessToken("refresh-test", persist, controller.signal);
    await persisted;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(persist).toHaveBeenCalledWith("rotated-test");
  });

  it("shares the same signal across pages and stops before a further page on abort", async () => {
    const controller = new AbortController();
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(Array(GSC_QUERY_STATS_PAGE_SIZE).fill({}))
      .mockResolvedValueOnce([]);
    await fetchGscQueryStats(credentials, { ...query, signal: controller.signal }, fetchPage);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    for (const [input] of fetchPage.mock.calls) expect(input.signal).toBe(controller.signal);
    fetchPage.mockClear().mockImplementationOnce(async () => {
      controller.abort();
      return Array(GSC_QUERY_STATS_PAGE_SIZE).fill({});
    });
    await expect(
      fetchGscQueryStats(credentials, { ...query, signal: controller.signal }, fetchPage),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchPage).toHaveBeenCalledOnce();
  });
});
