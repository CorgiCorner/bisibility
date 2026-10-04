type PinnedLookup = (
  hostname: string,
  options: { all?: boolean },
  callback: (error: Error | null, address: unknown, family?: number) => void,
) => void;

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
});
