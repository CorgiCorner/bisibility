import { describe, expect, it, vi } from "vitest";
import { crawlSite } from "./crawl";
import { auditRedirectUrl, sameOriginAuditUrl } from "./target";

const addresses = [{ address: "93.184.216.34", family: 4 }];
const html = (body = "<title>Example</title><h1>Example</h1>") =>
  new Response(body, { headers: { "content-type": "text/html" } });
const redirect = (url: string) => new Response(null, { status: 307, headers: { location: url } });
const credentialRedirect = new URL("https://www.example.com/");
credentialRedirect.username = "user";
credentialRedirect.password = "password";

describe("canonical audit redirect scope", () => {
  it.each([
    ["https://example.com", "https://www.example.com/"],
    ["https://www.example.com", "https://example.com/"],
    ["https://example.co.uk", "https://www.example.co.uk/"],
    ["https://tenant.github.io", "https://www.tenant.github.io/"],
    ["https://www.com", "https://www.www.com/"],
    ["https://www.www.com", "https://www.com/"],
    ["https://www.ck", "https://www.www.ck/"],
    ["https://www.www.ck", "https://www.ck/"],
  ])("accepts only the exact apex/www counterpart of %s", (origin, destination) => {
    expect(auditRedirectUrl(destination, new URL(origin), origin)?.href).toBe(destination);
    expect(sameOriginAuditUrl(destination, new URL(origin), origin)).toBeNull();
  });

  it.each([
    "https://www.example.com.evil.com/",
    "https://www.examp1e.com/",
    "https://example.com.evil.com/",
    "https://sub.example.com/",
    "https://www.example.com@evil.com/",
    credentialRedirect.href,
    "http://www.example.com/",
    "https://www.example.com:8443/",
    "https://www.example.com/?logout=1",
    "https://www.example.com/?next=https://evil.com",
    "https://127.0.0.1/",
  ])("rejects lookalikes, credentials, queries and origin changes: %s", (destination) => {
    expect(
      auditRedirectUrl(destination, new URL("https://example.com/"), "https://example.com"),
    ).toBeNull();
  });

  it.each([
    ["https://blog.example.com", "https://www.blog.example.com/"],
    ["https://github.io", "https://www.github.io/"],
    ["https://co.uk", "https://www.co.uk/"],
  ])("does not add www to arbitrary subdomains or public suffixes: %s", (origin, next) => {
    expect(auditRedirectUrl(next, new URL(origin), origin)).toBeNull();
  });
});

describe("canonical audit crawl", () => {
  it.each([
    ["example.com", "www.example.com"],
    ["www.example.com", "example.com"],
  ])("follows %s to %s without changing the report target", async (domain, canonical) => {
    const request = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname === "/robots.txt") return new Response("", { status: 404 });
      return url.hostname === domain ? redirect(`https://${canonical}/`) : html();
    });
    const result = await crawlSite(domain, 1, {
      fetch: request as typeof fetch,
      resolveHost: async () => addresses,
    });
    expect(result).toMatchObject({ target: `https://${domain}/`, state: "complete", requests: 4 });
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]).toMatchObject({
      url: `https://${domain}/`,
      finalUrl: `https://${canonical}/`,
      status: 200,
    });
  });

  it("checks destination robots before requesting HTML and deduplicates the canonical root", async () => {
    const resolveHost = vi.fn(async () => addresses);
    const request = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.hostname === "example.com")
        return url.pathname === "/robots.txt"
          ? new Response("", { status: 404 })
          : redirect("https://www.example.com/");
      if (url.pathname === "/robots.txt") return new Response("User-agent: *\nAllow: /\n");
      return html('<h1>Example</h1><a href="/">Home</a><a href="/about">About</a>');
    });
    const result = await crawlSite("example.com", 10, {
      fetch: request as typeof fetch,
      resolveHost,
    });
    expect(request.mock.calls.map(([url]) => String(url))).toEqual([
      "https://example.com/robots.txt",
      "https://example.com/",
      "https://www.example.com/robots.txt",
      "https://www.example.com/",
      "https://www.example.com/about",
    ]);
    expect(resolveHost).toHaveBeenCalledTimes(5);
    expect(result).toMatchObject({ requests: 5, state: "complete", summary: { pages: 2 } });
  });

  it("reuses robots already fetched through a canonical redirect", async () => {
    const request = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.hostname === "example.com") return redirect(`https://www.example.com${url.pathname}`);
      return url.pathname === "/robots.txt" ? new Response("User-agent: *\nAllow: /\n") : html();
    });
    const result = await crawlSite("example.com", 1, {
      fetch: request as typeof fetch,
      resolveHost: async () => addresses,
    });
    expect(result).toMatchObject({ requests: 4, state: "complete" });
    expect(
      request.mock.calls.filter(([url]) => String(url) === "https://www.example.com/robots.txt"),
    ).toHaveLength(1);
  });

  it("never requests a robots-disallowed canonical destination", async () => {
    const request = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.hostname === "example.com")
        return url.pathname === "/robots.txt"
          ? new Response("", { status: 404 })
          : redirect("https://www.example.com/");
      return new Response("User-agent: *\nDisallow: /\n");
    });
    const result = await crawlSite("example.com", 1, {
      fetch: request as typeof fetch,
      resolveHost: async () => addresses,
    });
    expect(result.pages[0]).toMatchObject({
      status: null,
      finalUrl: "https://www.example.com/",
      issues: [{ code: "robots_disallowed" }],
    });
    expect(request.mock.calls.map(([url]) => String(url))).not.toContain(
      "https://www.example.com/",
    );
  });

  it("does not request canonical HTML when destination robots cannot be read", async () => {
    const request = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.hostname === "www.example.com") throw new Error("robots unavailable");
      return url.pathname === "/robots.txt"
        ? new Response("", { status: 404 })
        : redirect("https://www.example.com/");
    });
    const result = await crawlSite("example.com", 1, {
      fetch: request as typeof fetch,
      resolveHost: async () => addresses,
    });
    expect(result.state).toBe("partial");
    expect(result.pages[0].status).toBeNull();
    expect(request.mock.calls.map(([url]) => String(url))).not.toContain(
      "https://www.example.com/",
    );
  });

  it("blocks canonical HTML when DNS changes after reading destination robots", async () => {
    let canonicalResolutions = 0;
    const request = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname === "/robots.txt") return new Response("", { status: 404 });
      return redirect("https://www.example.com/");
    });
    const result = await crawlSite("example.com", 1, {
      fetch: request as typeof fetch,
      resolveHost: async (hostname) => {
        if (hostname !== "www.example.com") return addresses;
        canonicalResolutions++;
        return canonicalResolutions === 1
          ? addresses
          : [...addresses, { address: "10.0.0.1", family: 4 }];
      },
    });
    expect(result.state).toBe("partial");
    expect(result.pages[0].status).toBeNull();
    expect(canonicalResolutions).toBe(2);
    expect(request.mock.calls.map(([url]) => String(url))).toEqual([
      "https://example.com/robots.txt",
      "https://example.com/",
      "https://www.example.com/robots.txt",
    ]);
  });

  it("blocks canonical HTML when destination robots returns HTTP 503", async () => {
    const request = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.hostname === "www.example.com") return new Response("Unavailable", { status: 503 });
      return url.pathname === "/robots.txt"
        ? new Response("", { status: 404 })
        : redirect("https://www.example.com/");
    });
    const result = await crawlSite("example.com", 1, {
      fetch: request as typeof fetch,
      resolveHost: async () => addresses,
    });
    expect(result.state).toBe("partial");
    expect(result.pages[0].status).toBeNull();
    expect(result.limitations).toContain("robots.txt returned HTTP 503.");
    expect(request.mock.calls.map(([url]) => String(url))).not.toContain(
      "https://www.example.com/",
    );
  });

  it.each([
    [{ address: "127.0.0.1", family: 4 }],
    [{ address: "10.0.0.1", family: 4 }],
    [addresses[0], { address: "192.168.1.1", family: 4 }],
    [addresses[0], { address: "::1", family: 6 }],
  ])("blocks a public-to-private or mixed DNS canonical hop: %j", async (...unsafe) => {
    const request = vi.fn(async (input: URL | RequestInfo) =>
      String(input).endsWith("/robots.txt")
        ? new Response("", { status: 404 })
        : redirect("https://www.example.com/"),
    );
    const result = await crawlSite("example.com", 1, {
      fetch: request as typeof fetch,
      resolveHost: async (hostname) => (hostname === "example.com" ? addresses : unsafe),
    });
    expect(result.state).toBe("partial");
    expect(result.pages[0].status).toBeNull();
    expect(request.mock.calls.map(([url]) => String(url))).toEqual([
      "https://example.com/robots.txt",
      "https://example.com/",
    ]);
  });

  it("keeps canonical redirect loops within the existing hop and request caps", async () => {
    const request = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname === "/robots.txt") return new Response("", { status: 404 });
      return redirect(
        `https://${url.hostname === "example.com" ? "www.example.com" : "example.com"}/`,
      );
    });
    const result = await crawlSite("example.com", 1, {
      fetch: request as typeof fetch,
      resolveHost: async () => addresses,
    });
    expect(result.state).toBe("partial");
    expect(result.requests).toBe(6);
    expect(result.pages[0].status).toBeNull();
    expect(result.limits).toMatchObject({
      maxRequests: 20,
      maxDurationMs: 15000,
      maxPageBytes: 524288,
    });
  });
});
