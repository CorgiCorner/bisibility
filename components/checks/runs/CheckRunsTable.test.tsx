import type { CheckRunRow, CheckRunsView } from "@/lib/checks/contract";
import { stubIntersectionObserver, stubResizeObserver } from "@/tests/observers";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CheckRunsTable } from "./CheckRunsTable";

const now = new Date("2026-07-24T14:45:00.000Z");

function marketRow(overrides: Partial<CheckRunRow> = {}): CheckRunRow {
  return {
    attemptCount: 1,
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
    expect(table).toHaveClass("min-w-[900px]");
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
      "",
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
});
