/// <reference types="vite/client" />
import "@/app/globals.css";
import "@/.storybook/preview-fonts.css";
import RankTrackerLoading from "@/app/(regional)/app/(workspace)/[project]/rank-tracker/loading";
import { KeywordDataTable } from "@/components/keywords/grid/KeywordDataTable";
import { KeywordsEmptyState } from "@/components/keywords/grid/KeywordsEmptyState";
import { KeywordsGridNotices } from "@/components/keywords/grid/KeywordsGridNotices";
import { KeywordsScopeControls } from "@/components/keywords/KeywordsScopeControls";
import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { MarketContextProvider } from "@/components/markets/MarketContextProvider";
import { ProjectRankTrackerMessages } from "@/components/rank-tracker/ProjectRankTrackerMessages";
import { Button } from "@/components/ui/Button";
import { emptyKeywordFilters } from "@/lib/keywords/keyword-filter-model";
import { aggregateMarketGridRows, groupRow } from "@/lib/keywords/market-grid-model";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";

const sizes = [
  [2048, 900],
  [834, 900],
  [390, 844],
] as const;
const themes = ["light", "dark"] as const;
const pending = {
  ...keywordRows[0],
  checkState: "never_checked" as const,
  hasRankData: false,
  lastCheckAt: null,
  lastCheckStatus: null,
  position: 101,
  positionHistory: [],
  previousPosition: 101,
  rankingPath: null,
  rankingUrl: null,
  rankingUrlHistory: [],
  sparkline: [],
};
const targets = [
  pending,
  {
    ...pending,
    id: "kw_second",
    device: "Mobile",
    location: {
      ...pending.location,
      canonicalKey: "country:es@es",
      countryCode: "ES",
      displayName: "Spain",
    },
  },
];
const aggregate = aggregateMarketGridRows(targets)[0];
const groupedRows = aggregate ? [groupRow(aggregate, aggregate.children)] : [];
const locations = [
  {
    count: 1,
    displayName: "United States",
    id: pending.location.canonicalKey,
    kind: "country" as const,
  },
];
function Provider({ children }: { children: React.ReactNode }) {
  return (
    <ProjectRankTrackerMessages>
      <MarketContextProvider projectRef="prj_fixture" market={null}>
        {children}
      </MarketContextProvider>
    </ProjectRankTrackerMessages>
  );
}
function table(grouped: boolean, density: "compact" | "standard", filtered = false) {
  const query = {
    filters: emptyKeywordFilters,
    grouped,
    lens: { device: "all" as const, locationId: null },
    page: 1,
    pageSize: 25 as const,
    savedViewId: null,
    search: "",
    sort: { direction: "asc" as const, field: "position" as const },
  };
  return (
    <Provider>
      <div className="w-full min-w-0 p-4 sm:p-5 lg:p-7">
        <KeywordsGridNotices
          {...{
            canManageProviders: true,
            checkStates: ["never_checked" as const],
            firstPendingKeywordId: pending.id,
            getFirstCheckRunPlanAction: vi.fn(),
            projectId: "prj_fixture",
            providerConnected: true,
            queueFirstChecksAction: vi.fn(),
            rowCount: 1,
          }}
        />
        <KeywordDataTable
          bulkClearTargetAction={vi.fn()}
          bulkDeleteAction={vi.fn()}
          bulkSetFrequencyAction={vi.fn()}
          bulkSetTargetAction={vi.fn()}
          bulkTagAction={vi.fn()}
          canDeleteKeyword={false}
          canUpdateKeyword
          filterChips={filtered ? [{ key: "change", label: "Change: Improved" }] : []}
          filterCount={filtered ? 1 : 0}
          initialDensity={density}
          matchedGroupCount={grouped ? 1 : undefined}
          matchedTargetCount={grouped ? 2 : 1}
          onAddKeyword={vi.fn()}
          onClearFilters={vi.fn()}
          onImportCsv={vi.fn()}
          onOpenExport={vi.fn()}
          onOpenFilters={vi.fn()}
          onRemoveFilter={vi.fn()}
          onRunChecks={vi.fn()}
          onSearchChange={vi.fn()}
          page={1}
          pageCount={1}
          pageSize={25}
          pendingCheckIds={new Set()}
          projectId="prj_fixture"
          providerConnected
          query={query}
          rows={grouped ? groupedRows : [pending]}
          searchValue=""
          updateKeywordAction={vi.fn()}
          savedViewControl={
            <Button variant="secondary" size="sm">
              All keywords
            </Button>
          }
          scopeControl={
            <KeywordsScopeControls
              basePath="/app/prj_fixture/rank-tracker"
              lens={query.lens}
              locationOptions={locations}
              query={query}
            />
          }
        />
      </div>
    </Provider>
  );
}
async function setup(width: number, height: number, theme: string) {
  await page.viewport(width, height);
  document.documentElement.dataset.theme = theme;
  document.body.style.minHeight = `${height}px`;
  document.body.style.fontFamily = "var(--font-sans), sans-serif";
  await cdp().send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
}
afterEach(async () => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
  await cdp().send("Emulation.setEmulatedMedia", { features: [] });
});
const cases = sizes.flatMap(([width, height]) =>
  themes.flatMap((theme) => [
    { width, height, theme, grouped: false, density: "standard" as const, filtered: false },
    { width, height, theme, grouped: true, density: "compact" as const, filtered: true },
  ]),
);
it.each(cases)(
  "keeps the toolbar against one header rule at $width/$theme/$grouped/$density",
  async ({ width, height, theme, grouped, density, filtered }) => {
    await setup(width, height, theme);
    render(table(grouped, density, filtered));
    const header = screen
      .getByRole("columnheader", { name: /Keyword/ })
      .closest('[role="row"]') as HTMLElement;
    const toolbar =
      document.querySelector<HTMLElement>("[data-keywords-toolbar]") ??
      screen.getByRole("searchbox").closest("label")?.parentElement?.parentElement?.parentElement;
    if (!toolbar) throw new Error("Expected toolbar");
    await waitFor(() => expect(header.getBoundingClientRect().width).toBeGreaterThan(100));
    await page.screenshot({
      path: `../.tmp/ui-comparison/rank-${width}-${theme}-${grouped ? "grouped" : "flat"}.png`,
    });
    expect(screen.queryByText("No rankings yet")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /Grouped|Flat/ })).not.toBeInTheDocument();
    expect(
      Math.abs(header.getBoundingClientRect().top - toolbar.getBoundingClientRect().bottom),
    ).toBeLessThan(1);
    expect(getComputedStyle(toolbar).borderBottomWidth).toBe("0px");
    expect(getComputedStyle(header).borderTopWidth).toBe("1px");
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
    if (!filtered) expect(document.querySelector("[data-keywords-filter-chips]")).toBeNull();
    if (width < 640)
      expect(
        screen.getByRole("searchbox").closest("label")?.getBoundingClientRect().width,
      ).toBeGreaterThan(200);
    const before = toolbar.getBoundingClientRect().height;
    await userEvent.click(page.getByRole("checkbox").first());
    expect(Math.abs(toolbar.getBoundingClientRect().height - before)).toBeLessThan(1);
  },
);
it.each(sizes.flatMap(([width, height]) => themes.map((theme) => ({ width, height, theme }))))(
  "uses the same compact loading toolbar at $width/$theme",
  async ({ width, height, theme }) => {
    await setup(width, height, theme);
    render(
      <Provider>
        <RankTrackerLoading />
      </Provider>,
    );
    const toolbar =
      document.querySelector<HTMLElement>("[data-keywords-toolbar]") ??
      document.querySelector<HTMLElement>('[class*="py-3.5"]');
    if (!toolbar) throw new Error("Expected loading toolbar");
    const header = toolbar.nextElementSibling?.firstElementChild?.firstElementChild as HTMLElement;
    await page.screenshot({ path: `../.tmp/ui-comparison/rank-${width}-${theme}-loading.png` });
    expect(
      Math.abs(header.getBoundingClientRect().top - toolbar.getBoundingClientRect().bottom),
    ).toBeLessThan(1);
    expect(getComputedStyle(toolbar).borderBottomWidth).toBe("0px");
    expect(getComputedStyle(header).borderTopWidth).toBe("1px");
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
  },
);

it.each(
  sizes.flatMap(([width, height]) =>
    themes.flatMap((theme) =>
      [false, true].map((hasMarkets) => ({ width, height, theme, hasMarkets })),
    ),
  ),
)(
  "keeps the real empty workspace for zero keywords at $width/$theme/$hasMarkets",
  async ({ width, height, theme, hasMarkets }) => {
    await setup(width, height, theme);
    render(
      <Provider>
        <div className="w-full min-w-0 p-4 sm:p-5 lg:p-7">
          <KeywordsEmptyState
            canCreateKeyword
            canManageProviders={false}
            hasMarkets={hasMarkets}
            projectId="prj_fixture"
            onAddKeyword={vi.fn()}
            onImportCsv={vi.fn()}
            onImportQueries={vi.fn()}
            providerConnected={false}
          />
        </div>
      </Provider>,
    );
    expect(
      screen.getByRole("heading", {
        name: hasMarkets ? "No keywords yet" : "Start with your first market",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("No rankings yet")).not.toBeInTheDocument();
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `../.tmp/ui-comparison/rank-${width}-${theme}-${hasMarkets ? "empty-one-market" : "zero-markets"}.png`,
    });
  },
);
