import type {
  KeywordResearchSourceDiagnostic,
  KeywordResearchSuccess,
} from "@/lib/keyword-research/types";
import { makeCostContext } from "@/tests/factories/cost-context";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ResearchResults } from "./ResearchResults";

vi.mock("./ResearchDetailPanel", () => ({ ResearchDetailPanel: () => <div /> }));
vi.mock("./ResearchFiltersDrawer", () => ({ ResearchFiltersDrawer: () => <div /> }));
vi.mock("./ResearchResultsTable", () => ({ ResearchResultsTable: () => <div /> }));

const costContext = makeCostContext({
  keywordCount: 1,
});

const defaultTracking = {
  device: "desktop" as const,
  location: {
    canonicalKey: "US",
    countryCode: "US",
    displayName: "United States",
    kind: "country" as const,
  },
  scheduleFrequency: "project_default" as const,
};

function makeResult(
  sources: KeywordResearchSourceDiagnostic[],
  fetchedAt = "2026-07-22T10:00:00.000Z",
): KeywordResearchSuccess {
  return {
    cached: false,
    cachedUntil: "2026-07-22T22:00:00.000Z",
    connections: [
      { id: "conn_a00000000000000000000000", label: "DataForSEO", provider: "dataforseo" },
    ],
    costCents: 4,
    fetchedAt,
    ok: true,
    provider: "DataForSEO",
    rows: [
      {
        alreadySaved: false,
        alreadyTracked: false,
        competition: null,
        cpcCents: null,
        difficulty: 20,
        intent: "commercial",
        keyword: "seo tool",
        monthlyTrend: [],
        searchVolume: 500,
        source: "related",
      },
    ],
    sources,
  };
}

function renderResults(result: KeywordResearchSuccess) {
  return render(
    <ResearchResults
      costContext={costContext}
      defaultTracking={defaultTracking}
      onAdd={vi.fn()}
      onDeeper={vi.fn()}
      projectId="prj_1"
      requestedLimit={100}
      result={result}
      seed="seo"
    />,
  );
}

const resultLimitSkip = [
  { cached: false, costCents: 2, returned: 60, source: "related", status: "ok" },
  { cached: false, costCents: 2, returned: 40, source: "suggestion", status: "ok" },
  {
    cached: false,
    costCents: 0,
    reason: "result_limit",
    returned: 0,
    source: "idea",
    status: "skipped",
  },
] satisfies KeywordResearchSourceDiagnostic[];

describe("ResearchResults diagnostics", () => {
  it("explains a result-limit skip as a plain-language note, not a warning", () => {
    renderResults(makeResult(resultLimitSkip));

    expect(
      screen.getByText(
        "Your 100 results came from related and suggestions - the ideas source was not needed, so it was not charged.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/results may be incomplete/)).not.toBeInTheDocument();
  });

  it("keeps diagnostic content and dismissal in stable grid columns", () => {
    renderResults(makeResult(resultLimitSkip));

    const banner = screen.getByTestId("research-diagnostics-banner");
    expect(banner).toHaveClass("grid", "grid-cols-[auto_minmax(0,1fr)_auto]", "items-center");
    expect(banner.querySelector("svg")).not.toHaveClass("mt-1");
    expect(screen.getByTestId("research-diagnostics-content")).toHaveTextContent(
      "Your 100 results came from related and suggestions",
    );
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });

  it("explains a cost-cap skip with the fetched result count", () => {
    renderResults(
      makeResult([
        { cached: false, costCents: 2, returned: 1, source: "related", status: "ok" },
        {
          cached: false,
          costCents: 0,
          reason: "cost_limit",
          returned: 0,
          source: "idea",
          status: "skipped",
        },
      ]),
    );

    expect(
      screen.getByText(
        "Your 1 result came from related - the ideas source was skipped to stay within the cost cap, so it was not charged.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps failed sources reading as warnings", () => {
    renderResults(
      makeResult([
        { cached: false, costCents: 2, returned: 1, source: "related", status: "ok" },
        {
          cached: false,
          costCents: 0,
          reason: "provider_error",
          returned: 0,
          source: "idea",
          status: "failed",
        },
      ]),
    );

    expect(
      screen.getByText("The ideas source failed (provider error) - results may be incomplete."),
    ).toBeInTheDocument();
  });

  it("dismisses the banner and brings it back for a new result set", () => {
    const { rerender } = renderResults(makeResult(resultLimitSkip));

    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(screen.queryByText(/Your 100 results/)).not.toBeInTheDocument();

    rerender(
      <ResearchResults
        costContext={costContext}
        defaultTracking={defaultTracking}
        onAdd={vi.fn()}
        onDeeper={vi.fn()}
        projectId="prj_1"
        requestedLimit={100}
        result={makeResult(resultLimitSkip, "2026-07-22T11:00:00.000Z")}
        seed="seo"
      />,
    );
    expect(screen.getByText(/Your 100 results/)).toBeInTheDocument();
  });
});
