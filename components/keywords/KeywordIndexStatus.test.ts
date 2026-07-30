import type { UrlPresenceView } from "@/lib/queries/keywords";
import { describe, expect, it } from "vitest";
import { indexStatusDisplay } from "./KeywordIndexStatus";

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
  it("maps indexed presence to a green indexed label with crawl date", () => {
    expect(indexStatusDisplay(presence())).toEqual({
      canonicalHint: null,
      detail: "last crawled Jul 1, 2026",
      label: "Indexed",
      tone: "green",
    });
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
      canonicalHint: "Canonical mismatch",
      detail: "checked Jul 4, 2026",
      label: "Not indexed",
      tone: "amber",
    });
  });

  it("renders nothing when no presence data exists", () => {
    expect(indexStatusDisplay(null)).toBeNull();
  });
});
