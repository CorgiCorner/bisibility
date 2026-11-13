import { describe, expect, it } from "vitest";
import { type SourceCatalog, sourceCatalog, sourceCatalogTypes } from "./source-catalog";
import { classifySourceDomain, isFixedSourceOrigin, registrableSourceDomain } from "./source-types";

const catalog = {
  community: ["example.com"],
  directory: ["example.org"],
  editorial: ["example.com"],
  reviews: ["example.org"],
} satisfies SourceCatalog;

const context = {
  catalog,
  competitorDomains: ["north.example.org"],
  excludedNames: ["Acme Tools"],
  override: null,
  ownDomain: "acme.example.com",
};

describe("source classification", () => {
  it("folds subdomains onto the registrable domain", () => {
    expect(registrableSourceDomain("https://www.ai.example.com/path")).toBe("example.com");
    expect(registrableSourceDomain("AI.Example.com")).toBe("example.com");
    expect(registrableSourceDomain("not a domain")).toBeNull();
  });

  it("uses own site, then excluded lookalikes, then competitors, then override, then catalog", () => {
    expect(classifySourceDomain("https://blog.acme.example.com/a", context).type).toBe("you");
    expect(
      classifySourceDomain("acme.example.com", {
        ...context,
        excludedNames: ["acme.example.com"],
        override: "directory",
      }).origin,
    ).toBe("you");
    expect(
      classifySourceDomain("www.lookalike.example.org", {
        ...context,
        competitorDomains: [],
        excludedNames: ["lookalike.example.org", "Acme Tools"],
      }),
    ).toEqual({
      origin: "not_you",
      type: "not_you",
    });
    expect(
      classifySourceDomain("shop.north.example.org", { ...context, override: "reviews" }),
    ).toEqual({
      origin: "competitor",
      type: "competitor",
    });
    expect(
      classifySourceDomain("ai.reviews.example.org", {
        ...context,
        competitorDomains: [],
        override: "other",
      }),
    ).toEqual({ origin: "override", type: "other" });
    expect(
      classifySourceDomain("https://directory.example.org/list", {
        ...context,
        competitorDomains: [],
      }),
    ).toEqual({
      origin: "catalog",
      type: "directory",
    });
    expect(
      classifySourceDomain("notes.example.org", {
        ...context,
        catalog: { ...catalog, directory: [], reviews: [] },
        competitorDomains: [],
      }),
    ).toEqual({
      origin: "unsorted",
      type: "unsorted",
    });
    expect(isFixedSourceOrigin("you")).toBe(true);
    expect(isFixedSourceOrigin("catalog")).toBe(false);
  });

  it("keeps a starter catalog of registrable domains with one type each", () => {
    const seen = new Set<string>();
    for (const type of sourceCatalogTypes) {
      const entries = sourceCatalog[type];
      expect(entries.length).toBeGreaterThanOrEqual(15);
      expect(entries.length).toBeLessThanOrEqual(40);
      for (const domain of entries) {
        expect(domain).toBe(registrableSourceDomain(domain));
        expect(seen.has(domain)).toBe(false);
        seen.add(domain);
      }
    }
  });
});
