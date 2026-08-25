import type { CheckRunRow } from "@/lib/checks/contract";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CheckRunStoredResults } from "./CheckRunStoredResults";

function baseRun(overrides: Partial<CheckRunRow> = {}): CheckRunRow {
  return {
    attemptCount: 1,
    storedResults: null,
    attempts: [
      {
        costCents: 0.35,
        degradedToCountry: false,
        detail: null,
        durationMs: 1_900,
        outcome: "ok",
        provider: "dataforseo",
        providerLabel: "DataForSEO",
      },
    ],
    checkedAt: "2026-07-24T13:45:00.000Z",
    costCents: 0.35,
    degradedToCountry: false,
    device: "desktop",
    durationMs: 1_900,
    error: null,
    estimatedCostCents: null,
    finishedAt: "2026-07-24T13:45:01.900Z",
    id: "run_completed",
    keyword: "AI tools directory",
    keywordId: "keyword_completed",
    keywordPublicId: "kw_ai_tools_directory",
    languageLabel: "English",
    location: "San Francisco, CA, US",
    position: 7,
    previousPosition: null,
    provider: "dataforseo",
    providerLabel: "DataForSEO",
    requestedDepth: 100,
    researchMetricsAvailable: true,
    startedAt: "2026-07-24T13:45:00.000Z",
    status: "completed",
    trigger: "scheduled",
    viaFallback: false,
    ...overrides,
  };
}

const keywordHref = "/app/rank-tracker/kw_ai_tools_directory";

describe("CheckRunStoredResults", () => {
  it("renders the eyebrow, retrieved counter, gap line and Open full results link for a full tier run", () => {
    render(
      <CheckRunStoredResults
        keywordHref={keywordHref}
        run={baseRun({
          storedResults: {
            tier: "full",
            stoppedAtResult: true,
            requestedDepth: 100,
            retrievedPositions: 22,
            fullDetailUntil: "2026-10-31T00:00:00.000Z",
          },
        })}
      />,
    );

    expect(screen.getByText("Retrieved results")).toBeInTheDocument();
    expect(screen.getByText("22 of 100 retrieved")).toBeInTheDocument();
    expect(screen.getByText("Your result at #7")).toBeInTheDocument();
    expect(screen.getByText("Positions 23-100 not retrieved")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The check stopped at your result, so these were never requested and never billed.",
      ),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Open full results/ });
    expect(link).toHaveAttribute("href", keywordHref);
  });

  it("renders nothing when the tier is none", () => {
    const { container } = render(
      <CheckRunStoredResults
        keywordHref={keywordHref}
        run={baseRun({
          storedResults: {
            tier: "none",
            stoppedAtResult: null,
            requestedDepth: 100,
            retrievedPositions: null,
            fullDetailUntil: null,
          },
        })}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the compact sentence and no gap line for a compact tier run", () => {
    render(
      <CheckRunStoredResults
        keywordHref={keywordHref}
        run={baseRun({
          position: null,
          storedResults: {
            tier: "compact",
            stoppedAtResult: null,
            requestedDepth: 100,
            retrievedPositions: null,
            fullDetailUntil: null,
          },
        })}
      />,
    );

    expect(
      screen.getByText(
        "Compact record. One row per domain with its best position survived; titles, URLs and page features did not.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Positions \d+-\d+ not retrieved/)).toBeNull();
    expect(screen.getByRole("link", { name: /Open full results/ })).toHaveAttribute(
      "href",
      keywordHref,
    );
  });
});
