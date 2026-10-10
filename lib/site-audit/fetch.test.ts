type PinnedLookup = (
  hostname: string,
  options: { all?: boolean },
  callback: (error: Error | null, address: unknown, family?: number) => void,
) => void;

import { getEventListeners } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAuditPage, MAX_PAGE_BYTES } from "./fetch";

const agents = vi.hoisted(() => ({
  options: [] as { connect: { lookup: PinnedLookup } }[],
  close: vi.fn(),
}));
vi.mock("undici", () => ({
  Agent: class {
    constructor(options: { connect: { lookup: PinnedLookup } }) {
      agents.options.push(options);
    }
    close = agents.close;
  },
}));
const budget = () => ({
  deadline: Date.now() + 15_000,
  requests: 0,
  origin: "https://example.com",
  signal: AbortSignal.timeout(15_000),
});
const resolveHost = async () => [{ address: "93.184.216.34", family: 4 }];
function credentialRedirectFixture() {
  const fixture = new URL("https://example.com/");
  fixture.username = "fixture-user";
  fixture.password = "fixture-password";
  return fixture.href;
}
afterEach(() => {
  vi.unstubAllEnvs();
  agents.options.length = 0;
  vi.clearAllMocks();
});
describe("site audit transport security", () => {
  it("pins DNS and never forwards credentials or cookies", async () => {
    const request = vi.fn().mockResolvedValue(new Response("ok"));
    await fetchAuditPage(new URL("https://example.com"), budget(), { fetch: request, resolveHost });
    const callback = vi.fn();
    agents.options[0].connect.lookup("example.com", { all: true }, callback);
    expect(callback).toHaveBeenCalledWith(null, [{ address: "93.184.216.34", family: 4 }]);
    expect(request.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
    expect(request.mock.calls[0][1].headers).not.toHaveProperty("Cookie");
    expect(request.mock.calls[0][1].headers).not.toHaveProperty("Authorization");
    expect(agents.close).toHaveBeenCalledOnce();
  });
  it.each(["127.0.0.1", "169.254.169.254", "10.0.0.1", "::ffff:127.0.0.1", "fd00::1"])(
    "blocks private DNS %s despite self-host webhook override",
    async (address) => {
      vi.stubEnv("WEBHOOK_ALLOW_PRIVATE_NETWORK", "1");
      const request = vi.fn();
      await expect(
        fetchAuditPage(new URL("https://example.com"), budget(), {
          fetch: request,
          resolveHost: async () => [{ address }],
        }),
      ).rejects.toThrow(/private-network/);
      expect(request).not.toHaveBeenCalled();
    },
  );
  it("rejects mixed public/private DNS answers and empty DNS", async () => {
    const request = vi.fn();
    await expect(
      fetchAuditPage(new URL("https://example.com"), budget(), {
        fetch: request,
        resolveHost: async () => [{ address: "93.184.216.34" }, { address: "192.168.1.1" }],
      }),
    ).rejects.toThrow();
    await expect(
      fetchAuditPage(new URL("https://example.com"), budget(), {
        fetch: request,
        resolveHost: async () => [],
      }),
    ).rejects.toThrow(/no public/);
    expect(request).not.toHaveBeenCalled();
  });
  it.each([
    "http://169.254.169.254/latest/meta-data",
    "https://evil.com/x",
    "http://example.com/",
    credentialRedirectFixture(),
  ])("rejects redirect to %s", async (location) => {
    const request = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 302, headers: { location } }));
    await expect(
      fetchAuditPage(new URL("https://example.com"), budget(), { fetch: request, resolveHost }),
    ).rejects.toThrow(/Redirect/);
    expect(request).toHaveBeenCalledOnce();
  });
  it("revalidates DNS on every redirect", async () => {
    const dns = vi
      .fn()
      .mockResolvedValueOnce([{ address: "93.184.216.34" }])
      .mockResolvedValueOnce([{ address: "127.0.0.1" }]);
    const request = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 302, headers: { location: "/next" } }));
    await expect(
      fetchAuditPage(new URL("https://example.com"), budget(), {
        fetch: request,
        resolveHost: dns,
      }),
    ).rejects.toThrow(/private-network/);
    expect(request).toHaveBeenCalledOnce();
  });
  it("cancels oversized streamed pages and rejects declared oversized pages", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_PAGE_BYTES + 1));
      },
      cancel,
    });
    await expect(
      fetchAuditPage(new URL("https://example.com"), budget(), {
        fetch: vi.fn().mockResolvedValue(new Response(body)),
        resolveHost,
      }),
    ).rejects.toThrow(/512 KiB/);
    expect(cancel).toHaveBeenCalled();
    await expect(
      fetchAuditPage(new URL("https://example.com"), budget(), {
        fetch: vi
          .fn()
          .mockResolvedValue(
            new Response("x", { headers: { "content-length": String(MAX_PAGE_BYTES + 1) } }),
          ),
        resolveHost,
      }),
    ).rejects.toThrow(/512 KiB/);
  });
  it("stops before I/O when the deadline or request cap is exhausted", async () => {
    const request = vi.fn();
    await expect(
      fetchAuditPage(
        new URL("https://example.com"),
        { ...budget(), requests: 20 },
        { fetch: request, resolveHost },
      ),
    ).rejects.toThrow(/request limit/);
    await expect(
      fetchAuditPage(
        new URL("https://example.com"),
        { ...budget(), deadline: Date.now() - 1 },
        { fetch: request, resolveHost },
      ),
    ).rejects.toThrow(/time limit/);
    expect(request).not.toHaveBeenCalled();
  });

  it.each([3, 4])("keeps a 429 retry separate from the %i-redirect chain", async (redirects) => {
    const paths: string[] = [];
    const dns = vi.fn(resolveHost);
    const request = vi.fn(async (input: URL | RequestInfo, _options: RequestInit) => {
      const path = new URL(String(input)).pathname;
      paths.push(path);
      if (paths.length === 1)
        return new Response("Rate limited", { status: 429, headers: { "retry-after": "0" } });
      const depth = Number(path.slice(1)) || 0;
      return depth < redirects
        ? new Response(null, { status: 302, headers: { location: `/${depth + 1}` } })
        : new Response("Recovered");
    });
    const limits = budget();
    const pending = fetchAuditPage(new URL("https://example.com/"), limits, {
      fetch: request as typeof fetch,
      resolveHost: dns,
    });
    if (redirects === 3)
      await expect(pending).resolves.toMatchObject({
        url: "https://example.com/3",
        status: 200,
        html: "Recovered",
      });
    else await expect(pending).rejects.toThrow("three-redirect audit limit");
    expect(paths).toEqual(["/", "/", "/1", "/2", "/3"]);
    expect(limits.requests).toBe(5);
    expect(dns).toHaveBeenCalledTimes(5);
    expect(agents.options).toHaveLength(5);
    expect(agents.close).toHaveBeenCalledTimes(5);
    for (const [, options] of request.mock.calls)
      expect(options).toMatchObject({ redirect: "manual" });
  });

  it("cleans aborted retry waits and gives the next invocation a fresh budget", async () => {
    vi.useFakeTimers();
    try {
      for (let cycle = 0; cycle < 3; cycle++) {
        const controller = new AbortController();
        const first = new Response("Rate limited", {
          status: 429,
          headers: { "retry-after": "1" },
        });
        const cancel = vi.spyOn(first.body as ReadableStream, "cancel");
        const request = vi
          .fn()
          .mockResolvedValueOnce(first)
          .mockResolvedValueOnce(new Response("Recovered"));
        const abortedBudget = { ...budget(), signal: controller.signal };
        const pending = fetchAuditPage(new URL("https://example.com/"), abortedBudget, {
          fetch: request,
          resolveHost,
        });
        const outcome = expect(pending).rejects.toThrow("Audit time limit reached.");
        await vi.advanceTimersByTimeAsync(0);
        expect(request).toHaveBeenCalledOnce();
        expect(cancel).toHaveBeenCalledOnce();
        controller.abort();
        await outcome;
        expect(vi.getTimerCount()).toBe(0);
        expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
        expect(abortedBudget.requests).toBe(1);
        expect(agents.close).toHaveBeenCalledTimes(cycle * 2 + 1);

        const fresh = budget();
        await expect(
          fetchAuditPage(new URL("https://example.com/"), fresh, {
            fetch: request,
            resolveHost,
          }),
        ).resolves.toMatchObject({ status: 200, html: "Recovered" });
        expect(request).toHaveBeenCalledTimes(2);
        expect(fresh.requests).toBe(1);
        expect(fresh.signal.aborted).toBe(false);
        expect(agents.options).toHaveLength(cycle * 2 + 2);
        expect(agents.close).toHaveBeenCalledTimes(cycle * 2 + 2);
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
