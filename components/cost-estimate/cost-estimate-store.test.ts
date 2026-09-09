import { costEstimateDataSchema } from "@/lib/cost-estimate/api-contract";
import { costEstimateFixture } from "@/tests/cost-estimate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCostEstimateStore } from "./cost-estimate-store";

const data = costEstimateFixture({
  keywordCount: 1,
  locationCount: 1,
  deviceCount: 1,
  depth: 20,
  frequency: "daily",
}).data;
const response = () => Response.json({ data });
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("cost estimate transport", () => {
  it("debounces discarded inputs before sending a request", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const store = createCostEstimateStore("/discarded");
    const unsubscribe = store.subscribe(vi.fn());
    unsubscribe();
    await vi.advanceTimersByTimeAsync(200);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("aborts abandoned requests and ignores their late responses", async () => {
    let finish: (value: Response) => void = () => {};
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    const store = createCostEstimateStore("/aborted");
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    await vi.advanceTimersByTimeAsync(150);
    const signal = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].signal;
    unsubscribe();
    expect(signal?.aborted).toBe(true);
    finish(response());
    await vi.advanceTimersByTimeAsync(1);
    expect(store.getSnapshot().status).toBe("loading");
    expect(listener).not.toHaveBeenCalled();
  });

  it.each([Response.json({}, { status: 503 }), Response.json({ data: { monthly_checks: 60 } })])(
    "allows retry after HTTP or response validation failure",
    async (failure) => {
      const fetcher = vi.fn().mockResolvedValueOnce(failure).mockResolvedValueOnce(response());
      vi.stubGlobal("fetch", fetcher);
      const store = createCostEstimateStore(`/retry-${failure.status}`);
      const unsubscribe = store.subscribe(vi.fn());
      await vi.advanceTimersByTimeAsync(150);
      expect(store.getSnapshot()).toEqual({ status: "error", data: null });
      store.retry();
      expect(store.getSnapshot().data).toBeNull();
      await vi.advanceTimersByTimeAsync(150);
      expect(store.getSnapshot()).toEqual({
        status: "ready",
        data: costEstimateDataSchema.parse(data),
      });
      expect(fetcher).toHaveBeenCalledTimes(2);
      unsubscribe();
    },
  );

  it("uses returned quantities unchanged and expires cached results", async () => {
    const serverData = { ...data, result_pages_per_run: 77, monthly_billing_units: 2310 };
    const fetcher = vi.fn().mockImplementation(async () => Response.json({ data: serverData }));
    vi.stubGlobal("fetch", fetcher);
    const store = createCostEstimateStore("/cached");
    const unsubscribe = store.subscribe(vi.fn());
    await vi.advanceTimersByTimeAsync(150);
    expect(store.getSnapshot().data?.result_pages_per_run).toBe(77);
    expect(createCostEstimateStore("/cached").getSnapshot().data?.monthly_billing_units).toBe(2310);
    unsubscribe();
    await vi.advanceTimersByTimeAsync(60_001);
    expect(createCostEstimateStore("/cached").getSnapshot().data).toBeNull();
  });
});
