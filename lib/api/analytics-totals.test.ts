import { ProviderAuthError } from "@/lib/providers/auth-error";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getSearchPerformanceTotals } from "./analytics-totals";
import type { ApiContext } from "./context";

const mocks = vi.hoisted(() => ({ connection: vi.fn(), totals: vi.fn(), reauth: vi.fn() }));
vi.mock("@/lib/search-insights/sync/credentials", () => ({
  readSearchInsightsConnection: mocks.connection,
}));
vi.mock("@/lib/search-insights/performance-totals", () => ({
  readPerformanceTotals: mocks.totals,
}));
vi.mock("@/lib/providers/auth-state", () => ({ markProviderNeedsReauth: mocks.reauth }));
const projectId = "prj_a00000000000000000000000";
function context(signal?: AbortSignal): ApiContext {
  const url = new URL(
    `https://example.com/api/v1/projects/${projectId}/analytics/totals?start_date=2024-03-01&end_date=2024-03-02&compare_previous=true`,
  );
  return {
    auth: { project: { id: "project", publicId: projectId } },
    headers: new Headers(),
    instance: "urn:test",
    req: new Request(url, { signal }),
    url,
  } as ApiContext;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.connection.mockResolvedValue({
    connection: {
      connectionId: "connection",
      property: "sc-domain:example.com",
      credentials: { apiKey: "fixture-refresh" },
    },
    problem: null,
  });
  mocks.totals.mockResolvedValue({
    source: "stored",
    current: { clicks: 10 },
    previous: { clicks: 5 },
  });
});
afterEach(() => vi.useRealTimers());
it("scopes every connection and data read to the authorized internal project", async () => {
  expect((await getSearchPerformanceTotals(context(), projectId)).status).toBe(200);
  expect(mocks.connection).toHaveBeenCalledExactlyOnceWith("project");
  expect(mocks.totals).toHaveBeenCalledWith(
    expect.objectContaining({
      projectId: "project",
      property: "sc-domain:example.com",
      comparePrevious: true,
    }),
  );
});
it("rejects another project's public id before any data access", async () => {
  expect((await getSearchPerformanceTotals(context(), "prj_b00000000000000000000000")).status).toBe(
    403,
  );
  expect(mocks.connection).not.toHaveBeenCalled();
  expect(mocks.totals).not.toHaveBeenCalled();
});
it.each(["missing", "disabled", "unreadable", "needs_reauth"])(
  "refuses %s connections even if stored history exists",
  async (problem) => {
    mocks.connection.mockResolvedValue({ connection: null, problem });
    expect((await getSearchPerformanceTotals(context(), projectId)).status).toBe(
      problem === "needs_reauth" ? 422 : 404,
    );
    expect(mocks.totals).not.toHaveBeenCalled();
  },
);
it("rejects invalid input before connection or provider access", async () => {
  const ctx = context();
  ctx.url.searchParams.set("start_date", "2024-02-30");
  await expect(getSearchPerformanceTotals(ctx, projectId)).rejects.toThrow();
  expect(mocks.connection).not.toHaveBeenCalled();
});
it("renews authorization only for genuine provider auth failures", async () => {
  mocks.totals.mockRejectedValue(new ProviderAuthError("gsc"));
  expect((await getSearchPerformanceTotals(context(), projectId)).status).toBe(422);
  expect(mocks.reauth).toHaveBeenCalledExactlyOnceWith({
    connectionId: "connection",
    projectId: "project",
    provider: "gsc",
  });
});
it("honors cancellation before serving cached or stored totals", async () => {
  expect((await getSearchPerformanceTotals(context(AbortSignal.abort()), projectId)).status).toBe(
    400,
  );
  expect(mocks.totals).not.toHaveBeenCalled();
  expect(mocks.reauth).not.toHaveBeenCalled();
});
it("bounds a hanging read without marking reauthorization", async () => {
  vi.useFakeTimers();
  mocks.totals.mockImplementation(() => new Promise(() => undefined));
  const pending = getSearchPerformanceTotals(context(), projectId);
  await vi.advanceTimersByTimeAsync(25001);
  expect((await pending).status).toBe(504);
  expect(mocks.reauth).not.toHaveBeenCalled();
});
