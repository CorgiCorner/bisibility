import {
  SessionSpendProvider,
  useSessionSpend,
} from "@/components/cost-estimate/SessionSpendProvider";
import { KeywordImportProvider } from "@/components/keywords/import/KeywordImportProvider";
import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { MarketContextProvider } from "@/components/markets/MarketContextProvider";
import { emptyKeywordFilters } from "@/lib/keywords/keyword-filter-model";
import { aggregateMarketGridRows, groupRow } from "@/lib/keywords/market-grid-model";
import type { MarketContextValue } from "@/lib/markets/market-context-value";
import { render } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, vi } from "vitest";
import { KeywordsGrid } from "./KeywordsGrid";

type KeywordsGridProps = ComponentProps<typeof KeywordsGrid>;
const viewportSpies: Array<{ mockRestore: () => void }> = [];

function stubKeywordTableViewport() {
  if (viewportSpies.length > 0) return;
  viewportSpies.push(
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1200),
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(1200),
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(650),
  );
}

afterEach(() => {
  for (const spy of viewportSpies.splice(0)) spy.mockRestore();
});

export function SessionSpendProbe() {
  const { sessionCents } = useSessionSpend();
  return <output aria-label="session spend cents">{sessionCents}</output>;
}

export function pendingRows(count = 2): KeywordsGridProps["rows"] {
  return keywordRows.slice(0, count).map((row) => ({
    ...row,
    checkState: "never_checked",
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
  }));
}

export function groupedPendingRows(): KeywordsGridProps["rows"] {
  const [row] = pendingRows(1);
  if (!row) return [];
  const targets = [
    row,
    {
      ...row,
      device: "Mobile",
      id: `${row.id}-es-mobile`,
      location: {
        ...row.location,
        canonicalKey: "country:es@es",
        countryCode: "ES",
        displayName: "Spain",
        gl: "es",
        hl: "es",
        id: "country:es@es",
        languageLabel: "Spanish",
      },
      locationName: "Spain / Spanish",
    },
  ];
  const aggregate = aggregateMarketGridRows(targets)[0];
  return aggregate ? [groupRow(aggregate, aggregate.children)] : [];
}

export function renderPendingGrid(
  overrides: Partial<KeywordsGridProps> = {},
  market: MarketContextValue["market"] = null,
) {
  stubKeywordTableViewport();
  const actions = {
    addKeywordsAction: vi.fn().mockResolvedValue({ created: 1, keywords: [] }),
    bulkClearTargetAction: vi.fn().mockResolvedValue({ updated: 1 }),
    bulkDeleteAction: vi.fn().mockResolvedValue({ deleted: 1 }),
    bulkSetFrequencyAction: vi.fn().mockResolvedValue({ updated: 1 }),
    bulkSetTargetAction: vi.fn().mockResolvedValue({ updated: 1 }),
    bulkTagAction: vi.fn().mockResolvedValue({ updated: 1 }),
    canCreateKeyword: true,
    canDeleteKeyword: true,
    canManageProviders: true,
    canUpdateKeyword: true,
    deletableSavedViewIds: [],
    getFirstCheckRunPlanAction: vi.fn().mockResolvedValue({
      budget: { capCents: 5000, spentCents: 0 },
      budgetExhausted: false,
      estimatedCostPerCheckCents: 0.1,
      isSampleProject: false,
      providerReady: true,
      providers: ["dataforseo"],
      readyCount: 2,
      scope: {
        depth: "Top 100",
        device: "Desktop",
        engine: "Google",
        frequency: "Daily",
        location: "United States",
      },
    }),
    queueFirstChecksAction: vi.fn().mockResolvedValue({ queued: 1 }),
    updateKeywordAction: vi.fn().mockResolvedValue({ updated: 1 }),
  };

  render(
    <MarketContextProvider market={market} projectRef="prj_1">
      <SessionSpendProvider>
        <SessionSpendProbe />
        <KeywordImportProvider activeProjectId="project_1">
          <KeywordsGrid
            {...actions}
            facets={{ intents: [], positions: [], tags: [], topics: [] }}
            lens={{ device: "all", locationId: null }}
            locations={[]}
            matchedTargetCount={2}
            page={1}
            pageCount={1}
            pageSize={25}
            projectId="prj_1"
            providerConnected={false}
            query={{
              filters: emptyKeywordFilters,
              grouped: false,
              lens: { device: "all", locationId: null },
              page: 1,
              pageSize: 25,
              savedViewId: null,
              search: "",
              sort: { direction: "asc", field: "position" },
            }}
            rows={pendingRows()}
            savedViews={[]}
            tagSuggestions={[]}
            totalCount={2}
            {...overrides}
          />
        </KeywordImportProvider>
      </SessionSpendProvider>
    </MarketContextProvider>,
  );

  return actions;
}
