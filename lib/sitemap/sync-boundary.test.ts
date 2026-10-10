import { afterEach, describe, expect, it, vi } from "vitest";
import { syncSitemapForProject } from "./sync";

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  fetch: vi.fn(),
  prisma: {
    project: { findFirst: vi.fn() },
    sitemapSnapshot: { findFirst: vi.fn(), create: vi.fn() },
  },
}));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("undici", async (importOriginal) => {
  const original = await importOriginal<typeof import("undici")>();
  return { ...original, fetch: mocks.fetch };
});
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/signals/emit", () => ({ emitSignal: vi.fn() }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function prepare() {
  vi.clearAllMocks();
  mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  mocks.prisma.project.findFirst.mockResolvedValue({ id: "project_1", domain: "example.com" });
  mocks.prisma.sitemapSnapshot.findFirst.mockResolvedValue(null);
  mocks.fetch.mockResolvedValue(
    new Response("<urlset><url><loc>https://example.com/live</loc></url></urlset>"),
  );
  vi.stubGlobal("fetch", mocks.fetch);
}

describe("sitemap outbound boundaries", () => {
  it("refuses a private root DNS answer before fetching", async () => {
    prepare();
    mocks.lookup.mockResolvedValue([{ address: "::ffff:7f00:1", family: 6 }]);
    await expect(syncSitemapForProject("project_1")).rejects.toThrow();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.prisma.sitemapSnapshot.create).not.toHaveBeenCalled();
  });
  it("refuses a private cross-host child before making its request", async () => {
    prepare();
    mocks.lookup.mockImplementation(async (host: string) => [
      { address: host === "child.example.org" ? "10.0.0.1" : "93.184.216.34", family: 4 },
    ]);
    mocks.fetch.mockImplementation(
      async () =>
        new Response(
          "<sitemapindex><sitemap><loc>http://child.example.org/private.xml</loc></sitemap></sitemapindex>",
        ),
    );
    await expect(syncSitemapForProject("project_1")).rejects.toThrow();
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });
  it("validates root redirects instead of following them automatically", async () => {
    prepare();
    mocks.lookup.mockImplementation(async (host: string) => [
      { address: host === "other.example.org" ? "10.0.0.1" : "93.184.216.34", family: 4 },
    ]);
    mocks.fetch.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "https://other.example.org/private.xml" },
      }),
    );
    await expect(syncSitemapForProject("project_1")).rejects.toThrow();
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.fetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ redirect: "manual", dispatcher: expect.anything() }),
    );
  });
  it("cancels streamed sitemap data immediately once the byte cap is crossed", async () => {
    prepare();
    const cancel = vi.fn();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(10 * 1024 * 1024 + 1));
      },
      cancel,
    });
    mocks.fetch.mockResolvedValue(new Response(body));
    const promise = syncSitemapForProject("project_1");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await expect(
        Promise.race([
          promise,
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error("deadline missed")), 100);
          }),
        ]),
      ).rejects.toThrow(/exceeds/);
      expect(cancel).toHaveBeenCalledOnce();
    } finally {
      clearTimeout(timer);
    }
  });
  it("supports apex-to-www redirects and public HTTP cross-host children", async () => {
    prepare();
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url === "https://example.com/sitemap.xml")
        return new Response(null, {
          status: 301,
          headers: { location: "https://www.example.com/maps/index.xml" },
        });
      if (url === "https://www.example.com/maps/index.xml")
        return new Response(
          "<sitemapindex><sitemap><loc>child.xml</loc></sitemap><sitemap><loc>http://child.example.org/other.xml</loc></sitemap></sitemapindex>",
        );
      return new Response(
        `<urlset><url><loc>https://example.com/${url.includes("other.xml") ? "two" : "one"}</loc></url></urlset>`,
      );
    });
    await expect(syncSitemapForProject("project_1")).resolves.toMatchObject({
      status: "baseline",
      urlCount: 2,
    });
    expect(mocks.fetch.mock.calls.map(([url]) => url)).toEqual([
      "https://example.com/sitemap.xml",
      "https://www.example.com/maps/index.xml",
      "https://www.example.com/maps/child.xml",
      "http://child.example.org/other.xml",
    ]);
    expect(mocks.lookup.mock.calls.map(([host]) => host)).toEqual([
      "example.com",
      "www.example.com",
      "www.example.com",
      "child.example.org",
    ]);
  });
});
