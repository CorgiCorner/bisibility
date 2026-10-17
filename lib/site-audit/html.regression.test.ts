import { describe, expect, it } from "vitest";
import { inspectHtml } from "./html";

function inspect(html: string) {
  return inspectHtml(
    {
      html,
      url: "https://example.com/news/index.html",
      status: 200,
      headers: new Headers({ "content-type": "text/html" }),
      responseTimeMs: 0,
    },
    "https://example.com/news/index.html",
  );
}

describe("HTML audit resolution", () => {
  it("resolves links with the first base href, including link counts", () => {
    const result = inspect(
      '<base target="_blank"><base href="/docs/"><base href="/ignored/"><a href="guide">Guide</a>',
    );
    expect(result.discovered).toEqual(["https://example.com/docs/guide"]);
    expect(result.page.internalLinkCount).toBe(1);
  });

  it("keeps links under an external base outside the crawl origin", () => {
    const result = inspect(
      '<base href="https://other.example.org/docs/"><a href="guide">Guide</a><a href="https://example.com/allowed">Allowed</a>',
    );
    expect(result.discovered).toEqual(["https://example.com/allowed"]);
    expect(result.page).toMatchObject({ internalLinkCount: 1, externalLinkCount: 1 });
  });

  it.each(["http://[", "data:text/plain,base", "javascript:alert(1)"])(
    "falls back for an unusable first base %s and ignores later bases",
    (href) => {
      const result = inspect(
        `<base href="${href}"><base href="/ignored/"><a href="guide">Guide</a>`,
      );
      expect(result.discovered).toEqual(["https://example.com/news/guide"]);
    },
  );

  it("retains credential and query guards when the base changes", () => {
    expect(
      inspect('<base href="https://user:pass@example.com/docs/"><a href="guide">Guide</a>')
        .discovered,
    ).toEqual([]);
    expect(inspect('<base href="/docs/"><a href="guide?logout=1">Guide</a>').discovered).toEqual(
      [],
    );
  });

  it("applies restrictive directives from every robots meta tag", () => {
    const result = inspect(
      '<meta name="robots" content="index"><meta name="ROBOTS" content="noindex"><h1>Fixture</h1>',
    );
    expect(result.page.indexable).toBe(false);
    expect(result.page.robots).toBe("index, noindex");
    expect(result.page.issues.map((issue) => issue.code)).toContain("noindex");
  });

  it("evaluates robots directives before truncating their display text", () => {
    const result = inspect(
      `<meta name="robots" content="${"max-snippet:100, ".repeat(20)}"><meta name="robots" content="none">`,
    );
    expect(result.page.indexable).toBe(false);
    expect(result.page.robots?.length).toBeLessThanOrEqual(200);
  });
});

describe("HTML audit heading text", () => {
  it("omits a script subtree inside a heading", () => {
    expect(inspect("<h1>Oferta<script>secret()</script></h1>").page.headings).toEqual([
      { level: 1, text: "Oferta" },
    ]);
  });

  for (const tag of ["script", "style"]) {
    it.each(["", " ", "\t", "\n", "/", " ignored"])(
      `omits ${tag} with parser-accepted closing separator %j`,
      (separator) => {
        const html = `<h2>Oferta<${tag.toUpperCase()}><b>raw source &amp; text</b></${tag.toUpperCase()}${separator}> koniec</h2>`;
        expect(inspect(html).page.headings).toEqual([{ level: 2, text: "Oferta koniec" }]);
      },
    );
  }

  it("skips raw-text content before applying its text-length bound", () => {
    expect(
      inspect(`<h1>Oferta<script>${"x".repeat(3000)}</script> koniec</h1>`).page.headings,
    ).toEqual([{ level: 1, text: "Oferta koniec" }]);
  });

  it("preserves ordinary descendants and one-pass entity decoding", () => {
    expect(
      inspect("<h1>A&amp;B <span>&amp;lt;tekst&amp;gt;</span><style>.hidden{}</style></h1>").page
        .headings,
    ).toEqual([{ level: 1, text: "A&B &lt;tekst&gt;" }]);
  });

  it("keeps existing hidden, noscript and template text semantics", () => {
    const html =
      "<h1>Oferta <span hidden>ukryta</span><noscript>fallback</noscript><template>szablon</template></h1>";
    expect(inspect(html).page.headings).toEqual([{ level: 1, text: "Oferta ukryta fallback" }]);
  });
});
