import { DeploymentAdmissionExhaustedError } from "@/lib/providers/execution-extension-errors";
import { ProviderUsagePersistenceError, readObservedResponse } from "@/lib/providers/usage";
import { providerUsageFailureDetails } from "@/lib/providers/usage-failure-details";
import { afterEach, describe, expect, it, vi } from "vitest";
import { serpApiProvider } from "./serpapi";
import { requestJson, SERP_API_SEARCH_TIMEOUT_MS } from "./serpapi-request";

const input = {
  credentials: { apiKey: "fixture-key" },
  device: "desktop" as const,
  domain: "example.com",
  keyword: "rank tracker",
  depth: 10 as const,
  location: {
    gl: "us",
    hl: "en",
    primaryGeoCode: null,
    primaryGeoName: "United States",
    secondaryGeoName: "United States",
  },
};
const success = {
  search_metadata: { id: "native-1", status: "Success" },
  organic_results: [{ position: 1, link: "https://example.com/result" }],
};
function observer() {
  const rows: Record<string, unknown>[] = [];
  return {
    rows,
    begin: vi.fn(async () => {
      rows.push({ status: "unknown" });
      return "79e01e67-ec10-4c12-a053-c5a906897b28";
    }),
    settle: vi.fn(async (_id, receipt) => {
      Object.assign(rows[0], receipt, {
        status: receipt.quantity === null ? "unknown" : "recorded",
      });
    }),
  };
}
function delayedResponse(headerMs: number, bodyMs: number, body: unknown) {
  return vi.fn(
    (_url, init: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const headers = setTimeout(() => {
          const stream = new ReadableStream({
            start(controller) {
              const timer = setTimeout(() => {
                controller.enqueue(new TextEncoder().encode(JSON.stringify(body)));
                controller.close();
              }, bodyMs);
              init.signal?.addEventListener(
                "abort",
                () => {
                  clearTimeout(timer);
                  controller.error(new DOMException("Aborted", "AbortError"));
                },
                { once: true },
              );
            },
          });
          resolve(new Response(stream, { status: 200 }));
        }, headerMs);
        init.signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(headers);
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      }),
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("bounded search receipts", () => {
  it("preserves a known budget refusal without dispatching a search", async () => {
    const denied = new DeploymentAdmissionExhaustedError("budget"),
      journal = observer(),
      fetchMock = vi.fn();
    journal.begin.mockRejectedValue(denied);
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      serpApiProvider.fetchRank({
        ...input,
        credentials: { ...input.credentials, usageObserver: journal },
      }),
    ).rejects.toBe(denied);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(journal.settle).not.toHaveBeenCalled();
  });
  it("never dispatches a search when admission persistence fails", async () => {
    const journal = observer();
    journal.begin.mockRejectedValue(Object.assign(new Error("private key"), { code: "P2024" }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const error = await serpApiProvider
      .fetchRank({ ...input, credentials: { ...input.credentials, usageObserver: journal } })
      .catch((error) => error);
    expect(error).toBeInstanceOf(ProviderUsagePersistenceError);
    expect(error.phase).toBe("admission");
    expect(providerUsageFailureDetails(error).causes).toContainEqual(
      expect.objectContaining({ code: "P2024" }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(journal.settle).not.toHaveBeenCalled();
  });

  it("keeps the journal unknown when receipt measurement throws", async () => {
    const journal = observer();
    const request = vi.fn().mockResolvedValue(new Response("{}"));
    await expect(
      readObservedResponse({
        observer: journal,
        request,
        measure: () => {
          throw new RangeError("private response");
        },
      }),
    ).rejects.toMatchObject({ phase: "measurement", name: "ProviderUsagePersistenceError" });
    expect(request).toHaveBeenCalledOnce();
    expect(journal.settle).toHaveBeenCalledOnce();
    expect(journal.rows[0]).toMatchObject({ status: "unknown", quantity: null, costCents: null });
  });

  it("does not report a connected account after its body read times out", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", delayedResponse(1_000, 12_000, { searches_per_month: 250 }));
    const result = expect(serpApiProvider.testConnection(input.credentials)).resolves.toMatchObject(
      { ok: false },
    );
    await vi.advanceTimersByTimeAsync(10_000);
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("finishes ten slow pages within the activity budget without repeat submissions", async () => {
    vi.useFakeTimers();
    const fetchMock = delayedResponse(66_250, 0, {
      ...success,
      organic_results: [{ position: 1, link: "https://example.org/result" }],
      serpapi_pagination: { next: "next-page" },
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = expect(
      serpApiProvider.fetchRank({ ...input, depth: 100, stopOnMatch: false }),
    ).resolves.toMatchObject({ billingUnits: 10, position: null });
    await vi.advanceTimersByTimeAsync(662_510);
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(10);
    expect(10 * SERP_API_SEARCH_TIMEOUT_MS).toBeLessThan(15 * 60_000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("accepts a 66.25-second success and settles the native receipt once", async () => {
    vi.useFakeTimers();
    const journal = observer();
    const fetchMock = delayedResponse(66_250, 0, success);
    vi.stubGlobal("fetch", fetchMock);
    const result = expect(
      serpApiProvider.fetchRank({
        ...input,
        credentials: { ...input.credentials, usageObserver: journal },
      }),
    ).resolves.toMatchObject({ position: 1, billingUnits: 1 });
    await vi.advanceTimersByTimeAsync(66_251);
    await result;
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(journal.settle).toHaveBeenCalledOnce();
    expect(journal.rows).toEqual([
      expect.objectContaining({
        status: "recorded",
        providerRequestId: "native-1",
        quantity: 1,
        failed: false,
      }),
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds the body read by the original deadline instead of clearing at headers", async () => {
    vi.useFakeTimers();
    const journal = observer();
    const fetchMock = delayedResponse(40_000, 40_000, success);
    vi.stubGlobal("fetch", fetchMock);
    const result = expect(
      serpApiProvider.fetchRank({
        ...input,
        credentials: { ...input.credentials, usageObserver: journal },
      }),
    ).rejects.toMatchObject({ phase: "response_body", name: "ProviderUsagePersistenceError" });
    await vi.advanceTimersByTimeAsync(SERP_API_SEARCH_TIMEOUT_MS);
    await result;
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(journal.rows).toEqual([expect.objectContaining({ status: "unknown", quantity: null })]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps a transport timeout unconfirmed and never submits a replacement search", async () => {
    vi.useFakeTimers();
    const journal = observer();
    const fetchMock = delayedResponse(90_000, 0, success);
    vi.stubGlobal("fetch", fetchMock);
    const promise = serpApiProvider.fetchRank({
      ...input,
      credentials: { ...input.credentials, usageObserver: journal },
    });
    const result = expect(promise).rejects.toMatchObject({ phase: "request" });
    await vi.advanceTimersByTimeAsync(90_000);
    await result;
    const error = await promise.catch((error) => error);
    expect(providerUsageFailureDetails(error).causes).toContainEqual(
      expect.objectContaining({ name: "AbortError" }),
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(journal.rows[0]).toMatchObject({ status: "unknown", quantity: null });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not retry an ambiguous HTTP failure without a receipt", async () => {
    const journal = observer();
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      serpApiProvider.fetchRank({
        ...input,
        credentials: { ...input.credentials, usageObserver: journal },
      }),
    ).rejects.toMatchObject({ phase: "measurement" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(journal.rows[0]).toMatchObject({ status: "unknown", quantity: null });
  });

  it("preserves a paid receipt on an HTTP error without retrying it", async () => {
    const journal = observer();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(success), { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      serpApiProvider.fetchRank({
        ...input,
        credentials: { ...input.credentials, usageObserver: journal },
      }),
    ).rejects.toMatchObject({ retryable: false });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(journal.rows[0]).toMatchObject({
      status: "recorded",
      quantity: 1,
      failed: true,
      providerRequestId: "native-1",
    });
  });

  it("wraps a raw settlement error and does not replay the paid request", async () => {
    const journal = observer();
    journal.settle.mockRejectedValue(
      Object.assign(new Error("private query and fixture-key"), { code: "P2024" }),
    );
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(success)));
    vi.stubGlobal("fetch", fetchMock);
    const error = await serpApiProvider
      .fetchRank({ ...input, credentials: { ...input.credentials, usageObserver: journal } })
      .catch((error) => error);
    expect(error).toBeInstanceOf(ProviderUsagePersistenceError);
    expect(error.phase).toBe("settlement");
    expect(providerUsageFailureDetails(error).causes).toContainEqual(
      expect.objectContaining({ code: "P2024" }),
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(journal.rows[0]).toEqual({ status: "unknown" });
  });

  it("shares a page deadline across known uncharged retries", async () => {
    vi.useFakeTimers();
    const journal = observer();
    const fetchMock = delayedResponse(40_000, 0, { error: "Temporarily unavailable" });
    vi.stubGlobal("fetch", fetchMock);
    const result = expect(
      serpApiProvider.fetchRank({
        ...input,
        credentials: { ...input.credentials, usageObserver: journal },
      }),
    ).rejects.toMatchObject({ phase: "request" });
    await vi.advanceTimersByTimeAsync(SERP_API_SEARCH_TIMEOUT_MS);
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retains bounded account transport retries without a paid search", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("network down"));
    vi.stubGlobal("fetch", fetchMock);
    const result = expect(
      requestJson("https://example.com/account.json", {}, 10_000),
    ).rejects.toMatchObject({ name: "SerpApiError" });
    await vi.advanceTimersByTimeAsync(600);
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
