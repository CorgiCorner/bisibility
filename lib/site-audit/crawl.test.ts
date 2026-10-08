import { describe, expect, it, vi } from "vitest";
import { crawlSite } from "./crawl";
import { inspectHtml } from "./html";
import { robotsDisallows } from "./robots";
import { auditTarget, sameOriginAuditUrl } from "./target";

const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/html" } });
const resolveHost = async () => [{ address: "93.184.216.34", family: 4 }];
describe("bounded site crawl", () => {
  it("crawls only unique same-origin query-free pages and reports broken links", async () => {
    const request = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.endsWith("/robots.txt"))
        return new Response("User-agent: *\nDisallow: /blocked", {
          headers: { "content-type": "text/plain" },
        });
      if (url.endsWith("/missing")) return html("Not found", 404);
      return html(
        '<title>Home &amp; more</title><meta name="description" content="Description"><h1>Home</h1><img src="x"><img alt=""><a href="/missing">Missing</a><a href="/missing#x">Duplicate</a><a href="/blocked">Blocked</a><a href="https://evil.example/x">External</a><a href="/?logout=1">Query</a>',
      );
    });
    const result = await crawlSite("example.com", 15, {
      fetch: request as typeof fetch,
      resolveHost,
    });
    expect(request.mock.calls.map(([url]) => String(url))).toEqual([
      "https://example.com/robots.txt",
      "https://example.com/",
      "https://example.com/missing",
    ]);
    expect(result.pages).toHaveLength(3);
    expect(result.pages[0]).toMatchObject({
      title: "Home & more",
      description: "Description",
      missingAltCount: 1,
      h1Count: 1,
      indexable: true,
    });
    expect(result.pages[0].issues.map((issue) => issue.code)).toContain("broken_internal_link");
    expect(result.pages[2].issues[0].code).toBe("robots_disallowed");
  });
  it("preserves a safe failure category without saving raw transport secrets", async () => {
    const request = vi.fn(async (input: URL | RequestInfo) => {
      if (String(input).endsWith("/robots.txt")) return new Response("", { status: 404 });
      throw new TypeError("fetch failed", {
        cause: { code: "CERT_HAS_EXPIRED", message: "internal certificate token=secret-value" },
      });
    });
    const result = await crawlSite("example.com", 10, {
      fetch: request as typeof fetch,
      resolveHost,
    });
    expect(result).toMatchObject({ state: "partial", stopReason: "finished" });
    expect(result.pages[0]).toMatchObject({
      status: null,
      issues: [{ code: "fetch_failed", message: "The secure connection could not be verified." }],
    });
    expect(JSON.stringify(result)).not.toContain("secret-value");
  });
  it("never fetches a robots-disallowed redirected destination", async () => {
    const request = vi.fn(async (input: URL | RequestInfo) => {
      if (String(input).endsWith("/robots.txt"))
        return new Response("User-agent: *\nDisallow: /private");
      return new Response(null, { status: 302, headers: { location: "/private" } });
    });
    const result = await crawlSite("example.com", 10, {
      fetch: request as typeof fetch,
      resolveHost,
    });
    expect(request.mock.calls.map(([url]) => String(url))).toEqual([
      "https://example.com/robots.txt",
      "https://example.com/",
    ]);
    expect(result.requests).toBe(2);
    expect(result.pages[0]).toMatchObject({
      finalUrl: "https://example.com/private",
      issues: [{ code: "robots_disallowed" }],
    });
  });
  it("returns a partial result at the page limit", async () => {
    const request = vi.fn(async (input: URL | RequestInfo) =>
      String(input).endsWith("/robots.txt")
        ? new Response("", { status: 404 })
        : html('<a href="/next">Next</a>'),
    );
    const result = await crawlSite("example.com", 1, {
      fetch: request as typeof fetch,
      resolveHost,
    });
    expect(result).toMatchObject({
      state: "partial",
      stopReason: "page_limit",
      summary: { pages: 1 },
      requests: 2,
    });
  });
  it("honors a global request cap across redirects", async () => {
    const request = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname === "/robots.txt") return new Response("", { status: 404 });
      const depth = Number(url.pathname.replace("/", "")) || 0;
      return depth % 3
        ? new Response(null, { status: 302, headers: { location: `/${depth + 1}` } })
        : html(`<a href="/${depth + 1}">Next</a>`);
    });
    const result = await crawlSite("example.com", 15, {
      fetch: request as typeof fetch,
      resolveHost,
    });
    expect(result.requests).toBeLessThanOrEqual(20);
    expect(result.stopReason).toBe("request_limit");
  });
  it("recognizes header and HTML robots and parses quoted HTML", () => {
    const result = inspectHtml(
      {
        html: '<meta name=robots content="noindex"><title title=">">A &amp; B</title><h1>Heading</h1>',
        url: "https://example.com/",
        status: 200,
        headers: new Headers({ "content-type": "text/html", "x-robots-tag": "nofollow" }),
        responseTimeMs: 10,
      },
      "https://example.com/",
    );
    expect(result.page).toMatchObject({
      title: "A & B",
      robots: "nofollow, noindex",
      indexable: false,
    });
  });
});
describe("audit targets", () => {
  it.each([
    "http://localhost",
    "http://127.0.0.1",
    "http://169.254.169.254",
    "http://[::1]",
    "https://user:pass@example.com",
    "https://example.com:8443",
    "file:///etc/passwd",
  ])("rejects %s", (input) => expect(() => auditTarget(input)).toThrow());
  it("rejects links outside the origin, credentials, query variants and protocols", () => {
    const base = new URL("https://example.com/");
    for (const value of [
      "https://evil.com",
      "http://example.com",
      "https://user:pass@example.com",
      "javascript:alert(1)",
      "/logout?yes=1",
    ])
      expect(sameOriginAuditUrl(value, base, base.origin)).toBeNull();
  });
  it("uses the longest robots rule and lets allow win a tie", () => {
    const robots = "User-agent: *\nDisallow: /private\nAllow: /private/public";
    expect(robotsDisallows(robots, "/private")).toBe(true);
    expect(robotsDisallows(robots, "/private/public")).toBe(false);
  });
});
