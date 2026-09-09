import { deferred } from "@/tests/deferred";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrackedFirstCheck } from "./first-check-progress";
import { createFirstCheckRunStore } from "./first-check-run-store";

const queued: TrackedFirstCheck = {
  device: "mobile",
  keywordId: "keyword_1",
  publicId: "kw_1",
  runId: "rcr_1",
  market: { languageLabel: "English", locationLabel: "United States" },
  status: "queued",
  text: "rank tracker",
};
const result = {
  costCents: 0.4,
  position: null,
  provider: "dataforseo",
  rankingUrl: null,
  requestedDepth: 20,
};
function response(status: string, rankCheck: unknown = null, publicId = "kw_1") {
  return Response.json({
    data: [{ blockedReason: null, keyword: { publicId }, rankCheck, status }],
  });
}
function setup() {
  const store = createFirstCheckRunStore();
  store.setState({ mode: "preview", rows: [queued], message: null, status: "queued" });
  const unsubscribe = store.subscribe(vi.fn());
  store.track("prj_1", queued);
  return { store, unsubscribe };
}

describe("first-check progress", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("observes the exact run through completion and keeps fractional cost and tracked depth", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response("queued"))
      .mockResolvedValueOnce(response("running"))
      .mockResolvedValueOnce(response("completed", result));
    vi.stubGlobal("fetch", fetch);
    const { store, unsubscribe } = setup();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getSnapshot().status).toBe("queued");
    expect(fetch).toHaveBeenCalledWith(
      "/api/rank-check-runs/rcr_1/items?project=prj_1&keyword=kw_1&limit=1",
      expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }),
    );
    await vi.advanceTimersByTimeAsync(2_000);
    expect(store.getSnapshot().rows[0]?.status).toBe("running");
    await vi.advanceTimersByTimeAsync(2_000);
    expect(store.getSnapshot()).toMatchObject({
      status: "completed",
      rows: [{ status: "completed", requestedDepth: 20, position: null, recordedCostCents: 0.4 }],
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch).toHaveBeenCalledTimes(3);
    unsubscribe();
  });

  it.each(["failed", "cancelled", "skipped", "deferred", "blocked"])(
    "settles a %s item without automatically launching another check",
    async (status) => {
      const fetch = vi.fn().mockResolvedValue(response(status));
      vi.stubGlobal("fetch", fetch);
      const { store, unsubscribe } = setup();
      await vi.advanceTimersByTimeAsync(0);
      expect(store.getSnapshot()).toMatchObject({
        status: "completed",
        rows: [{ status: "failed", message: `Check ${status}.` }],
      });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(fetch).toHaveBeenCalledTimes(1);
      unsubscribe();
    },
  );

  it.each([
    ["HTTP failure", () => new Response(null, { status: 503 })],
    ["missing result", () => response("completed")],
    ["different keyword", () => response("completed", result, "kw_other")],
    ["malformed result", () => response("completed", { ...result, costCents: "0.4" })],
  ])(
    "recovers from %s without treating a status-read failure as a failed check",
    async (_, firstResponse) => {
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(firstResponse())
        .mockResolvedValueOnce(response("completed", result));
      vi.stubGlobal("fetch", fetch);
      const { store, unsubscribe } = setup();
      await vi.advanceTimersByTimeAsync(0);
      expect(store.getSnapshot()).toMatchObject({
        status: "queued",
        rows: [{ status: "queued" }],
        message: expect.stringContaining("Retrying automatically"),
      });
      await vi.advanceTimersByTimeAsync(4_000);
      expect(store.getSnapshot()).toMatchObject({ status: "completed", message: null });
      unsubscribe();
    },
  );

  it("settles a completed legacy check even when depth and cost are unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          response("completed", { ...result, costCents: null, requestedDepth: null }),
        ),
    );
    const { store, unsubscribe } = setup();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getSnapshot()).toMatchObject({
      status: "completed",
      rows: [{ status: "completed", recordedCostCents: null, requestedDepth: undefined }],
    });
    unsubscribe();
  });

  it("tracks independent market runs without overwriting other results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("rcr_2") ? response("running", null, "kw_2") : response("completed", result),
      ),
    );
    const { store, unsubscribe } = setup();
    const second = { ...queued, keywordId: "keyword_2", publicId: "kw_2", runId: "rcr_2" };
    store.setState((state) => ({ ...state, rows: [...state.rows, second] }));
    store.track("prj_1", second);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getSnapshot()).toMatchObject({
      status: "running",
      rows: [{ status: "completed" }, { status: "running" }],
    });
    unsubscribe();
  });

  it("aborts on unsubscribe, ignores late responses and resumes observation on resubscribe", async () => {
    const stale = deferred<Response>();
    const fetch = vi
      .fn()
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValue(response("completed", result));
    vi.stubGlobal("fetch", fetch);
    const { store, unsubscribe } = setup();
    await vi.advanceTimersByTimeAsync(0);
    const signal = fetch.mock.calls[0]?.[1].signal as AbortSignal;
    unsubscribe();
    expect(signal.aborted).toBe(true);
    const resubscribe = store.subscribe(vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    stale.resolve(response("failed"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(store.getSnapshot()).toMatchObject({
      status: "completed",
      rows: [{ status: "completed" }],
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    resubscribe();
  });

  it("times out a stalled status read and retries it", async () => {
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        (_: string, { signal }: { signal: AbortSignal }) =>
          new Promise((_, reject) =>
            signal.addEventListener("abort", () => reject(new Error("Aborted"))),
          ),
      )
      .mockResolvedValueOnce(response("completed", result));
    vi.stubGlobal("fetch", fetch);
    const { store, unsubscribe } = setup();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(store.getSnapshot().message).toContain("Retrying automatically");
    await vi.advanceTimersByTimeAsync(4_000);
    expect(store.getSnapshot().status).toBe("completed");
    unsubscribe();
  });
});
