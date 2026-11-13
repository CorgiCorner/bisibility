import { expect, it } from "vitest";
import { domainWithoutTld, suggestBrandNames } from "./brand-name-suggestions";

it("suggests a domain stem and at most eight short keyword hits", () => {
  expect(domainWithoutTld("acme.example.com")).toBe("acme.example");
  expect(domainWithoutTld("example.com")).toBe("example");
  const suggestions = suggestBrandNames({
    aliases: [],
    domain: "acme.example.com",
    excludedNames: ["hidden acme"],
    includeKeywords: true,
    keywordTexts: [
      "best acme tools",
      "acmeology guide",
      "acme one two three four",
      "acme one two three four five six",
      "Acme",
      "hidden acme",
      ...Array.from({ length: 10 }, (_, index) => `acme phrase ${index}`),
    ],
    label: "Acme",
  });
  expect(suggestions.domainSuggestion).toBe("acme.example");
  expect(suggestions.keywordSuggestions).toEqual([
    "best acme tools",
    "acme one two three four",
    ...Array.from({ length: 6 }, (_, index) => `acme phrase ${index}`),
  ]);
});

it("skips keyword suggestions for a competitor and a stem that repeats the label", () => {
  expect(
    suggestBrandNames({
      domain: "example.com",
      includeKeywords: false,
      keywordTexts: ["example tools"],
      label: "Example",
    }),
  ).toEqual({ domainSuggestion: null, keywordSuggestions: [] });
});
