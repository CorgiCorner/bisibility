import type { UrlPresenceView } from "@/lib/queries/keywords";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { indexStatusDisplay, KeywordIndexStatus } from "./KeywordIndexStatus";

function presence(overrides: Partial<UrlPresenceView> = {}): UrlPresenceView {
  return {
    canonicalOk: true,
    checkedAt: "2026-07-04T03:45:00.000Z",
    coverageState: "Submitted and indexed",
    indexed: true,
    lastCrawlAt: "2026-07-01T10:15:00.000Z",
    url: "https://example.com/page",
    verdict: "PASS",
    ...overrides,
  };
}

describe("indexStatusDisplay", () => {
  it("maps supported presence fields to the reference's unified chips", () => {
    expect(indexStatusDisplay(presence())).toEqual({
      chips: [{ label: "Indexed" }, { label: "Canonical self" }, { label: "In sitemap" }],
      detail: "last crawled Jul 1, 2026",
    });

    render(createElement(KeywordIndexStatus, { presence: presence() }));
    expect(screen.getByText("Indexed")).toBeInTheDocument();
    expect(screen.getByText("Canonical self")).toBeInTheDocument();
    expect(screen.getByText("In sitemap")).toBeInTheDocument();
  });

  it("uses the neutral unified chip treatment for every supported label", () => {
    render(createElement(KeywordIndexStatus, { presence: presence() }));

    for (const label of ["Indexed", "Canonical self", "In sitemap"]) {
      const chip = screen.getByText(label);
      expect(chip).toHaveClass("border", "border-border", "bg-bg-sunken", "text-fg");
      expect(chip).not.toHaveClass("bg-green/10", "bg-yellow/15", "text-green-text");
    }
  });

  it("maps non-indexed presence and shows canonical mismatches", () => {
    expect(
      indexStatusDisplay(
        presence({
          canonicalOk: false,
          indexed: false,
          lastCrawlAt: null,
          verdict: "FAIL",
        }),
      ),
    ).toEqual({
      chips: [{ label: "Not indexed" }, { label: "Canonical mismatch" }, { label: "In sitemap" }],
      detail: "checked Jul 4, 2026",
    });
  });

  it("renders nothing when no presence data exists", () => {
    expect(indexStatusDisplay(null)).toBeNull();
  });
});
