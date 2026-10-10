import { describe, expect, it, vi } from "vitest";
import { preferredHreflangAlternate } from "./hreflang";

function alternate(document: string) {
  return preferredHreflangAlternate({
    document,
    allowedHosts: ["example.com"],
    baseUrl: "https://example.com/",
    countryCode: "PL",
    languageCode: "pl",
    logger: vi.fn(),
  });
}

describe("hreflang document parsing", () => {
  it("ignores commented and script-text alternates", () => {
    expect(
      alternate(`<!-- <link rel="alternate" hreflang="pl-PL" href="/old"> -->
      <script>const sample = '<link rel="alternate" hreflang="pl-PL" href="/script">';</script>
      <link rel="alternate" hreflang="pl-PL" href="/live">`),
    ).toBe("https://example.com/live");
  });
  it("decodes attribute entities before resolving the alternate", () => {
    expect(alternate('<link rel="alternate" hreflang="pl-PL" href="/page?a=1&amp;b=2">')).toBe(
      "https://example.com/page?a=1&b=2",
    );
  });
  it("does not accept credentials in an otherwise allowed alternate", () => {
    expect(
      alternate(
        '<link rel="alternate" hreflang="pl-PL" href="https://user:pass@example.com/page">',
      ),
    ).toBeNull();
  });
  it("keeps rejected alternate credentials and queries out of diagnostics", () => {
    for (const href of [
      "https://user:pass@example.com/page?token=fixture-secret",
      "https://other.example.org/page?token=fixture-secret",
    ]) {
      const logger = vi.fn();
      expect(
        preferredHreflangAlternate({
          allowedHosts: ["example.com"],
          baseUrl: "https://example.com/",
          document: `<link rel="alternate" hreflang="pl" href="${href}">`,
          languageCode: "pl",
          logger,
        }),
      ).toBeNull();
      expect(logger).toHaveBeenCalled();
      expect(JSON.stringify(logger.mock.calls)).not.toMatch(/\buser\b|\bpass\b|fixture-secret/);
    }
  });
});
