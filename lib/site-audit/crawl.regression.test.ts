import { describe, expect, it, vi } from "vitest";
import { crawlSite } from "./crawl";
import { auditCoverage, hasAuditContent } from "./presentation";

const resolveHost = async () => [{ address: "93.184.216.34", family: 4 }];
const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/html" } });
const content = '<title>Fixture</title><meta name="description" content="Fixture"><h1>Fixture</h1>';

describe("crawl document coverage", () => {
  it("ignores email-obfuscation helpers while retaining real 404 findings", async () => {
    const request = vi.fn(async (input: URL | RequestInfo) => {
      const path = new URL(String(input)).pathname;
      if (path === "/robots.txt") return new Response("", { status: 404 });
      if (path === "/")
        return html(
          `${content}<a href="/cdn-cgi/l/email-protection#deadbeef">Mail</a><a href="/real-missing">Missing</a>`,
        );
      return html("Not found", 404);
    });
    const result = await crawlSite("example.com", 15, {
      fetch: request as typeof fetch,
      resolveHost,
    });
    expect(request.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      "/robots.txt",
      "/",
      "/real-missing",
    ]);
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0].issues).toContainEqual({
      code: "broken_internal_link",
      severity: "warning",
      message: "1 sampled internal links returned HTTP errors.",
    });
    expect(result.pages[1].issues.map((issue) => issue.code)).toContain("http_error");
  });

  it("spends document budget on pages instead of known assets", async () => {
    const request = vi.fn(async (input: URL | RequestInfo) => {
      const path = new URL(String(input)).pathname;
      if (path === "/robots.txt") return new Response("", { status: 404 });
      if (path === "/")
        return html(
          `${content}<a href="/photo.JPG">Image</a><a href="/font.woff2">Font</a><a href="/brochure.pdf">PDF</a><a href="/app.js">Script</a><a href="/product">Product</a><a href="/product?utm_source=fixture">Tracking</a>`,
        );
      return html(content);
    });
    const result = await crawlSite("example.com", 2, {
      fetch: request as typeof fetch,
      resolveHost,
    });
    expect(request.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      "/robots.txt",
      "/",
      "/product",
    ]);
    expect(result.pages.map((page) => page.url)).toEqual([
      "https://example.com/",
      "https://example.com/product",
    ]);
    expect(result.state).toBe("complete");
  });

  it("does not discard HTML-looking or unknown document extensions", async () => {
    const request = vi.fn(async (input: URL | RequestInfo) => {
      const path = new URL(String(input)).pathname;
      if (path === "/robots.txt") return new Response("", { status: 404 });
      return html(
        path === "/"
          ? `${content}<a href="/page.html">HTML</a><a href="/page.weird">Unknown</a><a href="/images.jpg/gallery">Document</a>`
          : content,
      );
    });
    const result = await crawlSite("example.com", 15, {
      fetch: request as typeof fetch,
      resolveHost,
    });
    expect(result.pages).toHaveLength(4);
  });

  it("keeps persistent 429 responses as partial unavailable coverage", async () => {
    const request = vi.fn(async (input: URL | RequestInfo) =>
      String(input).endsWith("/robots.txt")
        ? new Response("", { status: 404 })
        : new Response("Rate limited", {
            status: 429,
            headers: { "content-type": "text/html", "retry-after": "0" },
          }),
    );
    const result = await crawlSite("example.com", 10, {
      fetch: request as typeof fetch,
      resolveHost,
    });
    expect(result.state).toBe("partial");
    expect(result.pages[0].status).toBe(429);
    expect(result.pages[0].issues.map((issue) => issue.code)).toEqual(["http_error"]);
    expect(hasAuditContent(result.pages[0])).toBe(false);
    expect(auditCoverage(result)).toEqual({ pages: 0, unavailable: 1, indexable: 0 });
  });

  it("does not report throttled targets as broken internal links", async () => {
    const request = vi.fn(async (input: URL | RequestInfo) => {
      const path = new URL(String(input)).pathname;
      if (path === "/robots.txt") return new Response("", { status: 404 });
      if (path === "/")
        return html(
          `${content}<a href="/throttled">Throttled</a><a href="/real-missing">Missing</a>`,
        );
      return new Response("Unavailable", {
        status: path === "/throttled" ? 429 : 404,
        headers: { "content-type": "text/html", "retry-after": "0" },
      });
    });
    const result = await crawlSite("example.com", 15, {
      fetch: request as typeof fetch,
      resolveHost,
    });
    expect(result.state).toBe("partial");
    expect(result.pages[0].issues).toContainEqual({
      code: "broken_internal_link",
      severity: "warning",
      message: "1 sampled internal links returned HTTP errors.",
    });
    expect(auditCoverage(result)).toEqual({ pages: 2, unavailable: 1, indexable: 1 });
  });

  it("keeps unavailable throttled robots policy partial and avoids further paths", async () => {
    const request = vi.fn(async (input: URL | RequestInfo) =>
      String(input).endsWith("/robots.txt")
        ? new Response("Rate limited", { status: 429, headers: { "retry-after": "0" } })
        : html(`${content}<a href="/next">Next</a>`),
    );
    const result = await crawlSite("example.com", 10, {
      fetch: request as typeof fetch,
      resolveHost,
    });
    expect(result.state).toBe("partial");
    expect(result.pages.map((page) => page.url)).toEqual(["https://example.com/"]);
    expect(result.limitations).toContain("robots.txt returned HTTP 429.");
  });
});
