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
  it("maps supported presence fields to the index status footer", () => {
    expect(indexStatusDisplay(presence())).toEqual({
      fields: [
        { label: "Indexed", value: "Yes" },
        { label: "Canonical", value: "Self" },
        { label: "Crawled", value: "Jul 1, 2026" },
        { label: "Last inspected", value: "Jul 4, 2026" },
      ],
    });

    render(createElement(KeywordIndexStatus, { presence: presence() }));
    expect(screen.getByText("Indexed")).toBeInTheDocument();
    expect(screen.getByText("Canonical")).toBeInTheDocument();
    expect(screen.getByText("Crawled")).toBeInTheDocument();
    expect(screen.getByText("Last inspected")).toBeInTheDocument();
  });

  it("uses compact neutral text for each status field", () => {
    render(createElement(KeywordIndexStatus, { presence: presence() }));

    for (const label of ["Indexed", "Canonical", "Crawled", "Last inspected"]) {
      expect(screen.getByText(label)).toHaveClass("font-semibold", "text-fg");
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
      fields: [
        { label: "Indexed", value: "No" },
        { label: "Canonical", value: "Mismatch" },
        { label: "Crawled", value: "Not crawled" },
        { label: "Last inspected", value: "Jul 4, 2026" },
      ],
    });
  });

  it("renders nothing when no presence data exists", () => {
    expect(indexStatusDisplay(null)).toBeNull();
  });
});
