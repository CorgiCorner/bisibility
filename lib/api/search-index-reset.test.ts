import "./search-index.test-support";
import { ProviderRateLimitedError } from "@/lib/providers/rate-limit-error";
import { afterEach, expect, it, vi } from "vitest";
import { handleApiRequest } from "./router";
import { createSearchIndexRequest, mocks } from "./search-index.test-support";

const request = createSearchIndexRequest(handleApiRequest);
afterEach(() => vi.useRealTimers());

it.each([
  ["2026-10-31T20:00:00Z", "2026-11-01T07:00:00.000Z"],
  ["2026-11-01T20:00:00Z", "2026-11-02T08:00:00.000Z"],
])("reports Pacific midnight for the first daily 429 at %s", async (now, expected) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(now));
  mocks.prisma.$queryRaw.mockImplementation(async () => [{ now: new Date() }]);
  mocks.provider.inspectUrl.mockRejectedValueOnce(
    new ProviderRateLimitedError("gsc", {
      scope: "daily",
      source: "provider",
      resetAt: Date.now() + 1_000,
      retryAfterMs: 1_500,
    }),
  );
  const response = await request("POST", "inspections", {
    urls: ["https://example.com/blog/a", "https://example.com/blog/b"],
  });
  const payload = await response.json();
  expect(payload.results.map((row: { error: unknown }) => row.error)).toEqual([
    expect.objectContaining({ scope: "daily", reset_at: expected }),
    expect.objectContaining({ scope: "daily", reset_at: expected }),
  ]);
  expect(mocks.provider.inspectUrl).toHaveBeenCalledTimes(1);
  expect(mocks.audit).toHaveBeenLastCalledWith(
    expect.objectContaining({ after: expect.objectContaining({ released: 1 }) }),
  );
});

it.each(["minute", "unknown"] as const)(
  "preserves longer RetryInfo for %s without a daily fence",
  async (scope) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-31T20:00:00Z"));
    mocks.prisma.$queryRaw.mockImplementation(async () => [{ now: new Date() }]);
    mocks.provider.inspectUrl.mockRejectedValueOnce(
      new ProviderRateLimitedError("gsc", {
        scope,
        source: "provider",
        resetAt: Date.now() + 1_000,
        retryAfterMs: 17_000,
      }),
    );
    const response = await request("POST", "inspections", { urls: ["https://example.com/blog/a"] });
    expect((await response.json()).results[0].error).toMatchObject({
      scope,
      reset_at: "2026-10-31T20:00:17.000Z",
    });
    expect(mocks.provider.inspectUrl).toHaveBeenCalledTimes(1);
  },
);
