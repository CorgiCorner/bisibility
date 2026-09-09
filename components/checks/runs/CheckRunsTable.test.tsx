import { parseCheckAttempts } from "@/lib/checks/attempts";
import type { CheckRunRow, CheckRunsView } from "@/lib/checks/contract";
import { stubIntersectionObserver, stubResizeObserver } from "@/tests/observers";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CheckRunsTable } from "./CheckRunsTable";
import { checkRunsFixtureView } from "./check-runs-fixtures";

const now = new Date("2026-07-24T14:45:00.000Z");

function marketRow(overrides: Partial<CheckRunRow> = {}): CheckRunRow {
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
    id: "run",
    keyword: "ai meeting notes",
    keywordId: "kw",
    keywordPublicId: "kw",
    languageLabel: "English",
    location: "San Francisco, CA, US",
    position: 4,
    previousPosition: 6,
    provider: "dataforseo",
    providerLabel: "DataForSEO",
    requestedDepth: 20,
    researchMetricsAvailable: true,
    startedAt: "2026-07-24T13:45:00.000Z",
    status: "completed",
    trigger: "scheduled",
    viaFallback: false,
    ...overrides,
  };
}

function viewFor(rows: CheckRunRow[]): CheckRunsView {
  return {
    counts: {
      completed: rows.length,
      deferred: 0,
      failed: 0,
      running: 0,
      runs: rows.length,
      viaFallback: 0,
    },
    deferredGroups: [],
    nextCursor: null,
    providerHealth: [],
    rows,
    spendCents: 0,
    staleCount: 0,
  };
}

function tableProps(view: CheckRunsView) {
  return {
    expandedRunIds: new Set<string>(),
    filter: "all" as const,
    keywordHref: (id: string) => `/app/rank-tracker/${id}`,
    now,
    onLoadMore: vi.fn(),
    onToggleRun: vi.fn(),
    view,
  };
}

describe("CheckRunsTable", () => {
  it("renders distinct Location, Language, and Device columns for rows with the same keyword text", () => {
    stubResizeObserver();
    stubIntersectionObserver();

    const rows = [
      marketRow({
        id: "run_sf_desktop",
        keywordPublicId: "kw_sf_desktop",
        location: "San Francisco, CA, US",
        languageLabel: "English",
        device: "desktop",
      }),
      marketRow({
        id: "run_lon_mobile",
        keywordPublicId: "kw_lon_mobile",
        location: "London, UK",
        languageLabel: "English",
        device: "mobile",
      }),
    ];

    render(<CheckRunsTable {...tableProps(viewFor(rows))} />);

    const table = screen.getByRole("table", { name: "Check runs" });
    expect(table).toHaveAttribute("data-layout", "auto");
    const headerCells = within(table).getAllByRole("columnheader");
    expect(headerCells.map((cell) => cell.textContent)).toEqual([
      "Status",
      "Keyword",
      "Location",
      "Language",
      "Device",
      "Result",
      "Provider",
      "Depth",
      "Cost",
      "When",
    ]);

    expect(screen.getByText("San Francisco, CA, US")).toBeInTheDocument();
    expect(screen.getByText("London, UK")).toBeInTheDocument();
    expect(screen.getByText("Desktop")).toBeInTheDocument();
    expect(screen.getByText("Mobile")).toBeInTheDocument();
  });

  it("renders a dash for a missing language label", () => {
    stubResizeObserver();
    stubIntersectionObserver();

    const rows = [
      marketRow({
        id: "run_no_lang",
        keywordPublicId: "kw_no_lang",
        languageLabel: null,
      }),
    ];

    render(<CheckRunsTable {...tableProps(viewFor(rows))} />);

    const table = screen.getByRole("table", { name: "Check runs" });
    const bodyRows = within(table).getAllByRole("row").slice(1);
    expect(bodyRows).toHaveLength(1);
    expect(within(bodyRows[0]).getByText("-")).toBeInTheDocument();
  });

  it("labels a tracked pair that has no volume or difficulty coverage", () => {
    stubResizeObserver();
    stubIntersectionObserver();

    render(
      <CheckRunsTable
        {...tableProps(
          viewFor([
            marketRow({
              languageLabel: "Arabic",
              location: "Belgium",
              researchMetricsAvailable: false,
            }),
          ]),
        )}
      />,
    );

    const marker = screen.getByRole("button", { name: /no volume\/KD:/ });
    expect(marker).toHaveTextContent("no volume/KD");
  });

  it("renders two rows with identical keyword text but different markets as visually distinguishable", () => {
    stubResizeObserver();
    stubIntersectionObserver();

    const rows = [
      marketRow({
        id: "run_sf",
        keywordPublicId: "kw_sf",
        location: "San Francisco, CA, US",
        device: "desktop",
      }),
      marketRow({
        id: "run_lon",
        keywordPublicId: "kw_lon",
        location: "London, UK",
        device: "mobile",
      }),
    ];

    render(<CheckRunsTable {...tableProps(viewFor(rows))} />);

    const table = screen.getByRole("table", { name: "Check runs" });
    const bodyRows = within(table).getAllByRole("row").slice(1);
    expect(bodyRows).toHaveLength(2);

    const firstMarket = within(bodyRows[0]).getByText("San Francisco, CA, US");
    const secondMarket = within(bodyRows[1]).getByText("London, UK");
    expect(firstMarket).not.toEqual(secondMarket);

    const keywordLinks = within(table).getAllByRole("link", { name: "ai meeting notes" });
    expect(keywordLinks).toHaveLength(2);
  });

  it("renders expanded details as depth-one section rows and toggles their group", () => {
    stubResizeObserver();
    stubIntersectionObserver();
    const onToggleRun = vi.fn();
    const run = marketRow({
      id: "run_stored_sections",
      storedResults: {
        tier: "full",
        stoppedAtResult: true,
        requestedDepth: 100,
        retrievedPositions: 22,
        fullDetailUntil: "2026-10-31T00:00:00.000Z",
      },
    });

    render(
      <CheckRunsTable
        {...tableProps(viewFor([run]))}
        expandedRunIds={new Set([run.id])}
        onToggleRun={onToggleRun}
      />,
    );

    const table = screen.getByRole("table", { name: "Check runs" });
    const statusResize = screen.getByRole("separator", { name: "Resize Status column" });
    expect(table.querySelectorAll('[data-depth="1"]')).not.toHaveLength(0);
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(table.style.getPropertyValue("--dt-col-status")).toBe("140px");
    expect(statusResize).toHaveAttribute("aria-valuemin", "140");
    expect(screen.getByText("Retrieved results")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Collapse ai meeting notes run/ }));
    expect(onToggleRun).toHaveBeenCalledWith(run.id);
  });

  it("keeps the manual load-more control outside the table", () => {
    stubResizeObserver();
    stubIntersectionObserver();
    const onLoadMore = vi.fn();
    render(<CheckRunsTable {...tableProps(checkRunsFixtureView)} onLoadMore={onLoadMore} />);

    fireEvent.click(screen.getByRole("button", { name: "Load 50 more" }));
    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it("does not expand a completed run whose storedResults is null", () => {
    stubResizeObserver();
    stubIntersectionObserver();

    const rows = [
      marketRow({
        id: "run_no_stored",
        keywordPublicId: "kw_no_stored",
        storedResults: null,
      }),
    ];

    render(<CheckRunsTable {...tableProps(viewFor(rows))} />);

    expect(screen.queryByRole("button", { name: /Expand ai meeting notes run/ })).toBeNull();
  });
  it("renders a failed run's legacy Ok attempt as the safe terminal failure", () => {
    stubResizeObserver();
    stubIntersectionObserver();
    const rawError = "All SERP providers failed: dataforseo (Ok.)";
    const failedRun = marketRow({
      attempts: parseCheckAttempts([{ message: "Ok.", provider: "dataforseo" }]),
      error: rawError,
      id: "run_failed_after_ok",
      position: null,
      status: "failed",
    });

    render(
      <CheckRunsTable
        {...tableProps(viewFor([failedRun]))}
        expandedRunIds={new Set([failedRun.id])}
      />,
    );

    const table = screen.getByRole("table", { name: "Check runs" });
    const compactResult = within(within(table).getAllByRole("row")[1]).getByTitle(
      "All providers failed",
    );
    expect(compactResult).toHaveTextContent("All providers failed");
    expect(screen.getByText("Provider chain").parentElement).toHaveTextContent(
      "All providers failed",
    );
    expect(screen.queryByText(rawError)).not.toBeInTheDocument();
    expect(table.querySelector(".text-green-text")).toBeNull();
    expect(table.querySelector(".text-red-text")).not.toBeNull();
    expect(screen.queryByText("Ok.")).not.toBeInTheDocument();
    expect(screen.queryByText("Completed")).not.toBeInTheDocument();
  });
});
