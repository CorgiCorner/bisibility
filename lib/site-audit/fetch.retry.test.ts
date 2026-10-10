import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAuditPage } from "./fetch";

const resolveHost = async () => [{ address: "93.184.216.34", family: 4 }];
const target = new URL("https://example.com/");
const budget = () => ({
  deadline: Date.now() + 15000,
  requests: 0,
  origin: target.origin,
  signal: new AbortController().signal,
});
const throttled = (retryAfter: string) =>
  new Response("Rate limited", { status: 429, headers: { "retry-after": retryAfter } });

afterEach(() => vi.useRealTimers());

describe("bounded Retry-After", () => {
  it("retries a 429 once, cancelling its body and revalidating DNS", async () => {
    const first = throttled("0");
    const cancel = vi.spyOn(first.body as ReadableStream, "cancel");
    const dns = vi.fn(resolveHost);
    const request = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(new Response("Recovered"));
    const limits = budget();
    const result = await fetchAuditPage(target, limits, { fetch: request, resolveHost: dns });
    expect(result).toMatchObject({ status: 200, html: "Recovered" });
    expect(cancel).toHaveBeenCalledOnce();
    expect(dns).toHaveBeenCalledTimes(2);
    expect(limits.requests).toBe(2);
  });

  it.each(["seconds", "http date"])("honors %s Retry-After before retrying", async (kind) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-08T12:00:00Z"));
    const header = kind === "seconds" ? "1" : new Date(Date.now() + 1000).toUTCString();
    const request = vi
      .fn()
      .mockResolvedValueOnce(throttled(header))
      .mockResolvedValueOnce(new Response("Recovered"));
    const pending = fetchAuditPage(target, budget(), { fetch: request, resolveHost });
    await vi.advanceTimersByTimeAsync(999);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).status).toBe(200);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("does not retry if Retry-After exceeds the global deadline", async () => {
    const request = vi.fn().mockResolvedValue(throttled("60"));
    const result = await fetchAuditPage(target, budget(), { fetch: request, resolveHost });
    expect(result.status).toBe(429);
    expect(request).toHaveBeenCalledOnce();
  });

  it("does not exceed the global request cap", async () => {
    const request = vi.fn().mockResolvedValue(throttled("0"));
    const limits = { ...budget(), requests: 19 };
    expect((await fetchAuditPage(target, limits, { fetch: request, resolveHost })).status).toBe(
      429,
    );
    expect(limits.requests).toBe(20);
    expect(request).toHaveBeenCalledOnce();
  });

  it("bounds persistent throttling to two attempts", async () => {
    const request = vi.fn().mockImplementation(async () => throttled("0"));
    expect((await fetchAuditPage(target, budget(), { fetch: request, resolveHost })).status).toBe(
      429,
    );
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("does not reuse DNS approval when a retry resolves privately", async () => {
    const dns = vi
      .fn()
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    const request = vi.fn().mockResolvedValue(throttled("0"));
    await expect(
      fetchAuditPage(target, budget(), { fetch: request, resolveHost: dns }),
    ).rejects.toThrow(/private-network/);
    expect(request).toHaveBeenCalledOnce();
  });

  it("aborts a retry wait without issuing another request", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const request = vi.fn().mockImplementation(async () => throttled("1"));
    const pending = fetchAuditPage(
      target,
      { ...budget(), signal: controller.signal },
      { fetch: request, resolveHost },
    );
    const outcome = expect(pending).rejects.toThrow("Audit time limit reached.");
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await outcome;
    expect(request).toHaveBeenCalledOnce();
  });

  it("uses bounded fallback delay for absent Retry-After", async () => {
    vi.useFakeTimers();
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response("Rate limited", { status: 429 }))
      .mockResolvedValueOnce(new Response("Recovered"));
    const pending = fetchAuditPage(target, budget(), { fetch: request, resolveHost });
    await vi.advanceTimersByTimeAsync(999);
    expect(request).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).status).toBe(200);
  });
});
