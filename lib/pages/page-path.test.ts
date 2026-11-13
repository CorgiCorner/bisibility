import { Prisma } from "@/lib/generated/prisma/client";
import { dimensionKeyHash } from "@/lib/search-insights/keys";
import { describe, expect, it } from "vitest";
import {
  canonicalPagePathSql,
  PAGE_PATH_HTTP_PATTERN,
  PAGE_PATH_WWW_PATTERN,
  pagePathForProject,
  pagePathHash,
  pagePathSqlRules,
  projectPageUrl,
} from "./page-path";

const domain = "example.com";

const documented = [
  ["https://example.com/pricing", "/pricing"],
  ["https://www.example.com/pricing/", "/pricing"],
  ["http://EXAMPLE.com/Docs/?a=b#frag", "/Docs?a=b"],
  ["https://example.com/pricing/?plan=pro#section", "/pricing?plan=pro"],
  ["https://example.com/", "/"],
  ["https://example.com", "/"],
  ["https://example.com/a?", "/a"],
  ["https://example.com:8443/docs", "/docs"],
  ["//www.example.com/docs/", "/docs"],
  ["/docs/", "/docs"],
  ["/docs/?a=b", "/docs?a=b"],
  ["docs/guide", "/docs/guide"],
  ["/?a=b", "/?a=b"],
  ["?tab=api", "/?tab=api"],
  ["#section", "/"],
  ["https://example.com/a%20b", "/a%20b"],
  ["https://example.com/%C3%BCber", "/%C3%BCber"],
  ["https://example.com/docs/./a", "/docs/a"],
  ["https://example.com/docs/../a/", "/a"],
  ["/docs/./../b", "/b"],
  ["/../a", "/a"],
  ["example.com/docs/", "/example.com/docs"],
  ["not a url", "/not%20a%20url"],
  ["https://example.com/a b", "/a%20b"],
  ["https://example.com/über", "/%C3%BCber"],
  ["https://example.com/docs?a=b c", "/docs?a=b%20c"],
] as const;

describe("pagePathForProject", () => {
  it.each(documented)("normalizes %s to %s", (input, expected) => {
    expect(pagePathForProject(domain, input)).toBe(expected);
    expect(pagePathSqlRules(domain, input)).toBe(expected);
  });

  it.each(documented)("matches the SQL rules for %s", (input) => {
    expect(pagePathSqlRules(domain, input)).toBe(pagePathForProject(domain, input));
  });

  it.each([
    "https://other.example/pricing",
    "https://blog.example.com/a",
    "https://example.org/a",
    "https://example.com.evil.example/a",
    "http://www.example.org/docs",
    "mailto:user@example.com",
    "javascript:alert(1)",
    "https://user:pass@example.com/secret",
    "",
    "   ",
    "https://",
  ])("rejects %s", (input) => {
    expect(pagePathForProject(domain, input)).toBeNull();
    expect(pagePathSqlRules(domain, input)).toBeNull();
  });

  it("accepts the project domain with or without www and a scheme", () => {
    expect(pagePathForProject("www.example.com", "https://example.com/a")).toBe("/a");
    expect(pagePathForProject("https://WWW.Example.com/ignored", "/a/")).toBe("/a");
    expect(pagePathSqlRules("www.example.com", "http://example.com/a/")).toBe("/a");
  });

  it("rejects every input when the project domain is empty", () => {
    expect(pagePathForProject("", "/docs")).toBeNull();
    expect(pagePathSqlRules("   ", "/docs")).toBeNull();
  });

  it("hashes the path the same way as a one-part dimension key", () => {
    expect(pagePathHash("/Docs?a=b")).toBe(dimensionKeyHash(["/Docs?a=b"]));
  });

  it("builds an absolute URL from the stored domain and the path", () => {
    expect(projectPageUrl("example.com", "/docs?a=1")).toBe("https://example.com/docs?a=1");
    expect(projectPageUrl("https://www.example.com/ignored", "/")).toBe("https://www.example.com/");
  });

  it("keeps the SQL fragment on the same authority patterns as the rules", () => {
    const sql = canonicalPagePathSql(Prisma.sql`"page"`, "example.com");
    expect(sql.values).toContain(PAGE_PATH_HTTP_PATTERN);
    expect(sql.values).toContain(PAGE_PATH_WWW_PATTERN);
    expect(sql.sql).toContain("/+$");
    expect(sql.sql).toContain("?");
    expect(sql.values).toContain("example.com");
    expect(sql.sql).not.toContain("example.com");
  });
});
