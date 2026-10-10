import { describe, expect, it, vi } from "vitest";
import { fetchExpectedUrlDocument } from "./fetch";

function input(overrides: Partial<Parameters<typeof fetchExpectedUrlDocument>[0]> = {}) {
  return {
    cache: new Map(),
    logger: vi.fn(),
    projectId: "project_1",
    url: "https://example.com/page",
    lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
    fetcher: vi.fn(async () => new Response("ok", { headers: { "content-type": "text/html" } })),
    ...overrides,
  };
}

async function bounded(result: Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      result,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve("deadline missed"), 100);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

describe("expected URL outbound boundaries", () => {
  it.each(["::ffff:7f00:1", "0:0:0:0:0:0:0:1", "fe90::1"])(
    "rejects private IPv6 spelling %s",
    async (address) => {
      const options = input({ lookup: vi.fn(async () => [{ address, family: 6 }]) });
      expect(await fetchExpectedUrlDocument(options)).toBeNull();
      expect(options.fetcher).not.toHaveBeenCalled();
    },
  );

  it("passes a DNS-pinned dispatcher to every redirect request", async () => {
    const fetcher = vi.fn(async (_url: string, options: RequestInit) => {
      expect(options).toHaveProperty("dispatcher");
      return fetcher.mock.calls.length === 1
        ? new Response(null, { status: 302, headers: { location: "/next" } })
        : new Response("ok", { headers: { "content-type": "text/html" } });
    });
    expect(await fetchExpectedUrlDocument(input({ fetcher }))).toMatchObject({ body: "ok" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("bounds stalled DNS before making a request", async () => {
    const options = input({ lookup: vi.fn(() => new Promise<never>(() => {})), timeoutMs: 5 });
    expect(await bounded(fetchExpectedUrlDocument(options))).toBeNull();
    expect(options.fetcher).not.toHaveBeenCalled();
  });

  it("bounds and cancels a body stalled after successful headers", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
      },
      cancel,
    });
    const options = input({
      fetcher: vi.fn(
        async () => new Response(stream, { headers: { "content-type": "text/html" } }),
      ),
      timeoutMs: 5,
    });
    expect(await bounded(fetchExpectedUrlDocument(options))).toBeNull();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("cancels a refused content type and oversized declared response", async () => {
    const headersList: Record<string, string>[] = [
      { "content-type": "application/json" },
      { "content-type": "text/html", "content-length": "1048577" },
    ];
    for (const headers of headersList) {
      const cancel = vi.fn();
      const response = new Response(new ReadableStream({ cancel }), { headers });
      expect(
        await fetchExpectedUrlDocument(input({ fetcher: vi.fn(async () => response) })),
      ).toBeNull();
      expect(cancel).toHaveBeenCalledOnce();
    }
  });
  it("cancels a response arriving after the header deadline", async () => {
    let resolveResponse!: (response: Response) => void;
    const options = input({
      fetcher: vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveResponse = resolve;
          }),
      ),
      timeoutMs: 5,
    });
    expect(await bounded(fetchExpectedUrlDocument(options))).toBeNull();
    const cancel = vi.fn();
    resolveResponse(new Response(new ReadableStream({ cancel })));
    await Promise.resolve();
    await Promise.resolve();
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("keeps the timeout bounded even if body cancellation stalls or rejects", async () => {
    for (const cancel of [
      () => new Promise<void>(() => {}),
      () => Promise.reject(new Error("cancel failed")),
    ]) {
      const options = input({
        fetcher: vi.fn(
          async () =>
            new Response(new ReadableStream({ cancel }), {
              headers: { "content-type": "text/html" },
            }),
        ),
        timeoutMs: 5,
      });
      expect(await bounded(fetchExpectedUrlDocument(options))).toBeNull();
    }
  });
  it("keeps rejected credential and query data out of diagnostics", async () => {
    const logger = vi.fn();
    const options = input({
      logger,
      url: "https://user:pass@example.com/path?token=fixture-secret",
    });
    expect(await fetchExpectedUrlDocument(options)).toBeNull();
    expect(JSON.stringify(logger.mock.calls)).not.toMatch(/\buser\b|\bpass\b|fixture-secret/);
    expect(options.logger).toHaveBeenCalledWith(
      expect.objectContaining({ reason: expect.any(String) }),
    );
  });
  it.each([
    "224.0.0.1",
    "::ffff:e000:1",
    "0:0:0:0:0:ffff:e000:1",
    "::ffff:224.0.0.1",
    "::e000:1",
    "::ffff:f000:1",
    "ff02::1",
  ])("rejects multicast and reserved address spelling %s", async (address) => {
    const options = input({
      lookup: vi.fn(async () => [{ address, family: address.includes(":") ? 6 : 4 }]),
    });
    expect(await fetchExpectedUrlDocument(options)).toBeNull();
    expect(options.fetcher).not.toHaveBeenCalled();
  });
});
