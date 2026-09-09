import { describe, expect, it, vi } from "vitest";
import { fetchExpectedUrlDocument } from "./fetch";

const publicDns = vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]);
const html = new Response("<html><head /></html>", { headers: { "content-type": "text/html" } });

function input(overrides: Partial<Parameters<typeof fetchExpectedUrlDocument>[0]> = {}) {
  return {
    cache: new Map(),
    fetcher: vi.fn(async () => html.clone()),
    logger: vi.fn(),
    lookup: publicDns,
    projectId: "project_1",
    url: "https://example.com/page",
    ...overrides,
  };
}

describe("fetchExpectedUrlDocument", () => {
  it.each([
    ["http", "http://example.com/page", publicDns],
    [
      "loopback",
      "https://example.com/page",
      vi.fn(async () => [{ address: "127.0.0.1", family: 4 }]),
    ],
    [
      "private",
      "https://example.com/page",
      vi.fn(async () => [{ address: "10.0.0.1", family: 4 }]),
    ],
    [
      "link-local",
      "https://example.com/page",
      vi.fn(async () => [{ address: "169.254.1.1", family: 4 }]),
    ],
    [
      "metadata",
      "https://example.com/page",
      vi.fn(async () => [{ address: "169.254.169.254", family: 4 }]),
    ],
    [
      "ipv6 loopback",
      "https://example.com/page",
      vi.fn(async () => [{ address: "::1", family: 6 }]),
    ],
  ])("rejects %s addresses and logs a reason", async (_name, url, lookup) => {
    const value = input({ lookup, url });
    await expect(fetchExpectedUrlDocument(value)).resolves.toBeNull();
    expect(value.logger).toHaveBeenCalledWith(
      expect.objectContaining({ reason: expect.any(String) }),
    );
    expect(value.fetcher).not.toHaveBeenCalled();
  });

  it("rejects redirects to private addresses and a fourth redirect", async () => {
    const redirect = new Response(null, {
      headers: { location: "https://private.example.org/page" },
      status: 302,
    });
    const privateLookup = vi.fn(async (host: string) =>
      host === "private.example.org"
        ? [{ address: "10.0.0.1", family: 4 }]
        : [{ address: "93.184.216.34", family: 4 }],
    );
    await expect(
      fetchExpectedUrlDocument(
        input({ fetcher: vi.fn(async () => redirect.clone()), lookup: privateLookup }),
      ),
    ).resolves.toBeNull();

    const redirectLoop = vi.fn(
      async () =>
        new Response(null, { headers: { location: "https://example.com/next" }, status: 302 }),
    );
    await expect(fetchExpectedUrlDocument(input({ fetcher: redirectLoop }))).resolves.toBeNull();
    expect(redirectLoop).toHaveBeenCalledTimes(4);
  });

  it("rejects timeouts, oversized bodies, and non-document content without throwing", async () => {
    const timeoutFetcher = vi.fn(async (_url: string, request: RequestInit) => {
      await new Promise<void>((_resolve, reject) =>
        request.signal?.addEventListener("abort", () => reject(new Error("aborted"))),
      );
      return html.clone();
    });
    await expect(
      fetchExpectedUrlDocument(input({ fetcher: timeoutFetcher, timeoutMs: 1 })),
    ).resolves.toBeNull();
    await expect(
      fetchExpectedUrlDocument(
        input({
          fetcher: vi.fn(
            async () =>
              new Response("x", {
                headers: { "content-length": "1048577", "content-type": "text/html" },
              }),
          ),
        }),
      ),
    ).resolves.toBeNull();
    await expect(
      fetchExpectedUrlDocument(
        input({
          fetcher: vi.fn(
            async () => new Response("{}", { headers: { "content-type": "application/json" } }),
          ),
        }),
      ),
    ).resolves.toBeNull();
  });

  it("caches a successful project URL lookup", async () => {
    const value = input();
    await expect(fetchExpectedUrlDocument(value)).resolves.toMatchObject({
      contentType: "text/html",
    });
    await expect(fetchExpectedUrlDocument(value)).resolves.toMatchObject({
      contentType: "text/html",
    });
    expect(value.fetcher).toHaveBeenCalledOnce();
  });
});
