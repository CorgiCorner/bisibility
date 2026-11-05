import { analyticsReadDeadlineMs } from "@/lib/providers/analytics/read-deadline";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  fetchQueryStats: vi.fn(),
  markReauth: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { providerConnection: { findMany: mocks.findMany } },
}));
vi.mock("@/lib/providers/auth-state", () => ({ markProviderNeedsReauth: mocks.markReauth }));
vi.mock("@/lib/providers/registry", () => ({
  getAnalyticsProvider: () => ({
    id: "gsc",
    label: "Search Console",
    fetchQueryStats: mocks.fetchQueryStats,
  }),
}));
vi.mock("@/lib/traffic/runtime-credentials", () => ({
  trafficRuntimeCredentials: () => ({ apiKey: "test-refresh" }),
}));

import { listSearchPerformanceQueryStats } from "./analytics-query-stats";
import type { ApiContext } from "./context";

const projectId = "prj_a00000000000000000000000";
function context(signal?: AbortSignal): ApiContext {
  const url = new URL(
    "https://example.com/api/v1/projects/test/analytics/query-stats?start_date=2026-10-01&end_date=2026-10-28",
  );
  return {
    auth: { project: { id: "project", publicId: projectId } },
    headers: new Headers(),
    instance: "urn:test",
    req: new Request(url, { signal }),
    url,
  } as ApiContext;
}

describe("search-performance operation deadline", () => {
  it.each(["", "0", "-1", "999", "120001", "NaN", "1e4", "25000oops"])(
    "keeps a finite default for invalid timeout %s",
    (value) => {
      expect(analyticsReadDeadlineMs(value)).toBe(25_000);
    },
  );
  it.each(["1000", "25000", "120000"])("accepts a bounded timeout %s", (value) => {
    expect(analyticsReadDeadlineMs(value)).toBe(Number(value));
  });
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.findMany.mockResolvedValue([
      { id: "connection", publicId: "conn_a00000000000000000000000", provider: "gsc" },
    ]);
  });
  afterEach(() => vi.useRealTimers());

  it("returns a bounded 504 and never marks a timed-out connection for reauthorization", async () => {
    vi.useFakeTimers();
    mocks.fetchQueryStats.mockImplementation(() => new Promise(() => undefined));
    const pending = listSearchPerformanceQueryStats(context(), projectId);
    await vi.advanceTimersByTimeAsync(25_001);
    const response = await pending;
    expect(response.status).toBe(504);
    expect(await response.json()).toMatchObject({
      type: "https://bisibility.com/problems/provider_unavailable",
      detail: "Provider request deadline reached.",
    });
    expect(mocks.fetchQueryStats.mock.calls[0][1].signal.aborted).toBe(true);
    expect(mocks.markReauth).not.toHaveBeenCalled();
  });

  it("honors caller cancellation without dispatch or reauthorization", async () => {
    const response = await listSearchPerformanceQueryStats(context(AbortSignal.abort()), projectId);
    expect(response.status).toBe(400);
    expect((await response.json()).detail).toBe("Provider request was cancelled.");
    expect(mocks.fetchQueryStats).not.toHaveBeenCalled();
    expect(mocks.markReauth).not.toHaveBeenCalled();
  });

  it("keeps genuine provider authorization failures at 422", async () => {
    mocks.fetchQueryStats.mockRejectedValue(new ProviderAuthError("gsc"));
    const response = await listSearchPerformanceQueryStats(context(), projectId);
    expect(response.status).toBe(422);
    expect(mocks.markReauth).toHaveBeenCalledOnce();
  });

  it("keeps successful query rows and response metadata", async () => {
    mocks.fetchQueryStats.mockResolvedValue([
      { query: "example", clicks: 1, impressions: 2, ctr: 0.5, position: 3 },
    ]);
    const response = await listSearchPerformanceQueryStats(context(), projectId);
    expect(response.status).toBe(200);
    expect((await response.json()).rows).toEqual([
      { query: "example", clicks: 1, impressions: 2, ctr: 0.5, position: 3 },
    ]);
    expect(mocks.markReauth).not.toHaveBeenCalled();
  });
});
