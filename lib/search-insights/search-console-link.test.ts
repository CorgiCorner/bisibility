import { describe, expect, it } from "vitest";
import { searchConsoleQueryHref } from "./search-console-link";

describe("Search Console query link", () => {
  it.each(["sc-domain:example.com", "https://example.org/docs/"])(
    "preserves the exact query, displayed dates and %s property without URL injection",
    (property) => {
      const query = "tools & tips + 日本語 / ! = #";
      const url = new URL(
        searchConsoleQueryHref(property, query, { start: "2026-09-19", end: "2026-09-25" }),
      );
      expect(url.origin).toBe("https://search.google.com");
      expect(url.pathname).toBe("/search-console/performance/search-analytics");
      expect(Object.fromEntries(url.searchParams)).toEqual({
        resource_id: property,
        query: `!${query}`,
        dates: "20260919,20260925",
        type: "web",
        breakdown: "page",
      });
    },
  );
});
