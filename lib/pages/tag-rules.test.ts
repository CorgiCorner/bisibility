import { emptyPageTagForm, pageTagFormSchema } from "@/lib/schemas/page-tag";
import { describe, expect, it } from "vitest";
import { compileTagPattern, matchPagesForRule, TagPatternError, tagPatternCode } from "./tag-rules";

const pages = [
  { id: "root", path: "/" },
  { id: "docs", path: "/docs" },
  { id: "docs-slash", path: "/docs/" },
  { id: "nested", path: "/docs/guide" },
  { id: "category", path: "/categories/tools" },
  { id: "category-deep", path: "/categories/tools/ai" },
  { id: "private", path: "/private/secret" },
  { id: "literal", path: "/(a+)+" },
  { id: "dot", path: "/.foo" },
  { id: "plain", path: "/foo" },
  { id: "query", path: "/docs?a=1" },
  { id: "cased", path: "/Docs" },
];

describe("tag pattern grammar", () => {
  it.each([
    ["/{slug}", "/docs", true],
    ["/{slug}", "/a", true],
    ["/{slug}", "/", false],
    ["/{slug}", "/docs/guide", false],
    ["/{slug}", "/docs/", true],
    ["/docs/", "/docs", true],
    ["/categories/*", "/categories/tools", true],
    ["/categories/*", "/categories/tools/ai", true],
    ["/categories/*", "/categories", false],
    ["/compare/{slug}", "/compare/flow", true],
    ["/blog/*/edit", "/blog/a/edit", true],
    ["/blog/*/edit", "/blog/a/b/edit", true],
    ["/Docs", "/docs", false],
    ["/docs", "/Docs", false],
    ["/{slug}", "/docs?a=1", true],
    ["/*", "/docs/guide", true],
    ["/*", "/", true],
    ["/(a+)+", "/(a+)+", true],
    ["/(a+)+", "/docs", false],
    ["/.*", "/.foo", true],
    ["/.*", "/foo", false],
    ["/{Slug}", "/docs", false],
    ["/docs/{slug}/edit", "/docs/guide/edit", true],
  ] as const)("matches %s against %s", (pattern, path, expected) => {
    const compiled = compileTagPattern(pattern);
    expect(compiled.ok).toBe(true);
    if (compiled.ok) expect(compiled.matches(path)).toBe(expected);
  });

  it("rejects patterns that do not start with a slash or that are empty", () => {
    expect(tagPatternCode("")).toBe("required");
    expect(tagPatternCode("   ")).toBe("required");
    expect(tagPatternCode("docs")).toBe("must_start_with_slash");
    expect(tagPatternCode("*")).toBe("must_start_with_slash");
    expect(tagPatternCode(`/${"a".repeat(500)}`)).toBe("too_long");
  });

  it("collapses consecutive stars and rejects more than 16 wildcards", () => {
    const doubled = compileTagPattern("/docs/**");
    const single = compileTagPattern("/docs/*");
    expect(doubled.ok).toBe(true);
    expect(single.ok).toBe(true);
    if (!doubled.ok || !single.ok) return;
    expect(doubled.pattern).toBe("/docs/*");
    expect(doubled.matches("/docs/a/b")).toBe(single.matches("/docs/a/b"));
    expect(tagPatternCode(`/${"*".repeat(40)}`)).toBeNull();
    const sixteen = `/${Array.from({ length: 16 }, () => "{slug}").join("/")}`;
    const seventeen = `/${Array.from({ length: 17 }, () => "*").join("/")}`;
    expect(tagPatternCode(sixteen)).toBeNull();
    expect(tagPatternCode(seventeen)).toBe("too_many_wildcards");
    expect(compileTagPattern(seventeen)).toEqual({ code: "too_many_wildcards", ok: false });
    const mixed = `/${Array.from({ length: 9 }, () => "{slug}").join("/")}/*/*/*/*/*/*/*/*`;
    expect(tagPatternCode(mixed)).toBe("too_many_wildcards");
    const parsed = pageTagFormSchema.safeParse({
      ...emptyPageTagForm,
      pattern: seventeen,
      tagName: "Docs",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.message === "too_many_wildcards")).toBe(
        true,
      );
    }
  });

  it("treats regex metacharacters as literals and finishes without backtracking", () => {
    const hostile = `/${"*/".repeat(12)}x`;
    const path = `/${"a/".repeat(80)}x`;
    const compiled = compileTagPattern(hostile);
    expect(compiled.ok).toBe(true);
    const started = performance.now();
    if (compiled.ok) {
      for (let index = 0; index < 30; index += 1) compiled.matches(path);
      expect(compiled.matches(`/${"(a+)+".repeat(40)}`)).toBe(false);
    }
    expect(performance.now() - started).toBeLessThan(200);
    const literal = compileTagPattern("/(a+)+$");
    expect(literal.ok && literal.matches("a".repeat(32))).toBe(false);
    expect(literal.ok && literal.matches("/(a+)+$")).toBe(true);
  });
});

describe("matchPagesForRule", () => {
  it("applies each kind and the same grammar for exclusions", () => {
    expect(
      matchPagesForRule(
        { excludePatterns: ["/private/*"], kind: "path_pattern", pattern: "/*" },
        pages,
      ).map((page) => page.path),
    ).not.toContain("/private/secret");
    expect(
      matchPagesForRule({ kind: "path_pattern", pattern: "/{slug}" }, pages).map((page) => page.id),
    ).toEqual(["literal", "dot", "cased", "docs", "docs-slash", "query", "plain"]);
    expect(
      matchPagesForRule({ kind: "sitemap", sitemapUrl: "https://example.com/sitemap.xml" }, [
        { id: "listed", path: "/docs", sitemapUrls: ["https://example.com/sitemap.xml"] },
        { id: "other", path: "/blog", sitemapUrls: ["https://example.com/news.xml"] },
      ]).map((page) => page.id),
    ).toEqual(["listed"]);
    expect(
      matchPagesForRule({ kind: "url_list", urls: ["/docs", "/missing"] }, pages).map(
        (page) => page.path,
      ),
    ).toEqual(["/docs"]);
    expect(matchPagesForRule({ kind: "manual" }, pages)).toEqual([]);
  });

  it("refuses an invalid exclude pattern instead of matching everything", () => {
    expect(() =>
      matchPagesForRule(
        { excludePatterns: ["private"], kind: "path_pattern", pattern: "/*" },
        pages,
      ),
    ).toThrow(TagPatternError);
  });
});
