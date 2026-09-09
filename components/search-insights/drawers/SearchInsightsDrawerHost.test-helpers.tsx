import {
  NEUTRAL_COPY,
  ORGANIC_SESSIONS_LABEL,
} from "@/components/search-insights/search-insights-copy";
import { handleShellKeyDown } from "@/components/shell/command-keyboard";
import { ToastProvider } from "@/components/ui/Toast";
import { DRAWER_LIST_CAP } from "@/lib/search-insights/constants";
import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  storyBandList,
  storyCostContext,
  storyOverlapList,
  storyPageDetail,
  storyProjectMarkets,
  storyQueryDetail,
} from "./drawer-story-fixtures";
import { SearchInsightsDrawerHost } from "./SearchInsightsDrawerHost";
import { useSearchInsightsDrawerHandlers } from "./useDrawerHandlers";

const mocks = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@/lib/analytics/client", () => ({ track: mocks.track }));

export function analyticsMock() {
  return mocks;
}

export const actions = {
  addKeywordsAction: vi.fn(),
  loadBandListAction: vi.fn(),
  loadOverlapListAction: vi.fn(),
  loadPageDetailAction: vi.fn(),
  loadQueryDetailAction: vi.fn(),
  loadTrackDialogAction: vi.fn(),
};

export const shellActions = {
  closePalette: vi.fn(),
  togglePalette: vi.fn(),
};

export function Openers() {
  const drawers = useSearchInsightsDrawerHandlers();

  return (
    <div>
      <button onClick={() => drawers.openList("band", 33, 1_284)} type="button">
        chip band
      </button>
      <button onClick={() => drawers.openList("overlap", 5, 1_284)} type="button">
        chip overlap
      </button>
      <button onClick={() => drawers.openList("band", 0, 0)} type="button">
        empty band no named
      </button>
      <button onClick={() => drawers.openList("band", 0, 12)} type="button">
        empty band named
      </button>
      <button onClick={() => drawers.openList("overlap", 0, 0)} type="button">
        empty overlap no named
      </button>
      <button onClick={() => drawers.openList("overlap", 0, 12)} type="button">
        empty overlap named
      </button>
      <button onClick={() => drawers.openQuery({ query: "rank tracking software" })} type="button">
        row query
      </button>
      <button onClick={() => drawers.track({ query: "keyword rank checker" })} type="button">
        track other
      </button>
      <button
        onClick={() =>
          drawers.openPage({
            clicks: 0,
            ctr: 0,
            engagementRate: null,
            impressions: 0,
            keyEvents: null,
            path: "/guides/rank-tracking",
            position: 0,
            sessions: null,
            url: "https://example.com/guides/rank-tracking",
          })
        }
        type="button"
      >
        row page
      </button>
      {/* biome-ignore lint/a11y/useSemanticElements: The test stub mirrors the product's div-based ARIA table. */}
      <div role="table">
        {/* biome-ignore lint/a11y/useSemanticElements: The test stub mirrors the product's div-based ARIA table. */}
        <div role="rowgroup">
          {/* biome-ignore lint/a11y/useSemanticElements: The test stub mirrors the product's div-based ARIA table. */}
          <div data-testid="query-row" role="row" tabIndex={0}>
            {/* biome-ignore lint/a11y/useSemanticElements: The test stub mirrors the product's div-based ARIA table. */}
            <div role="cell">
              {drawers.adding.size > 0 || drawers.tracked.size > 0 ? (
                <span>Adding</span>
              ) : (
                <button
                  onClick={() => drawers.track({ query: "rank tracking software" })}
                  type="button"
                >
                  row track
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      <span data-testid="adding">{[...drawers.adding].join(",") || "none"}</span>
      <span data-testid="tracked">{[...drawers.tracked].join(",") || "none"}</span>
    </div>
  );
}

export function renderHost(
  overrides: Partial<typeof actions> = {},
  scope: Record<string, string> = {},
) {
  return render(
    <div
      onKeyDownCapture={(event) =>
        handleShellKeyDown(event, { ...shellActions, paletteOpen: false })
      }
    >
      <ToastProvider>
        <SearchInsightsDrawerHost
          {...actions}
          {...overrides}
          canCreateKeyword
          period="28"
          projectId="prj_1"
          property="sc-domain:example.com"
          {...scope}
        >
          <Openers />
        </SearchInsightsDrawerHost>
      </ToastProvider>
    </div>,
  );
}

export function panel() {
  return screen.getByRole("dialog");
}

export function expectNaturalRightAlignedFooter(element: HTMLElement) {
  const footer = element.closest("footer");
  expect(footer).not.toBeNull();
  const alignment = footer?.firstElementChild;
  expect(alignment).toHaveClass("flex", "min-w-0", "justify-end");
  expect(element).not.toHaveClass("flex-1");
  expect(element).not.toHaveStyle({ flex: "1" });
}

export function resetDrawerHostMocks() {
  vi.clearAllMocks();
  window.localStorage.clear();
  mocks.track.mockReset();
  actions.loadBandListAction.mockResolvedValue(storyBandList);
  actions.loadOverlapListAction.mockResolvedValue(storyOverlapList);
  actions.loadPageDetailAction.mockResolvedValue(storyPageDetail);
  actions.loadQueryDetailAction.mockResolvedValue(storyQueryDetail);
  actions.loadTrackDialogAction.mockResolvedValue({
    costContext: storyCostContext,
    defaultDevice: "desktop",
    defaultMarketKey: "es-es",
    projectMarkets: storyProjectMarkets,
  });
  actions.addKeywordsAction.mockResolvedValue({
    created: 1,
    persistedKeywordCount: 1,
    keywords: [],
    skippedDuplicates: 0,
  });
}

export function tools() {
  return {
    beforeEach,
    describe,
    DRAWER_LIST_CAP,
    expect,
    it,
    NEUTRAL_COPY,
    ORGANIC_SESSIONS_LABEL,
    render,
    screen,
    storyBandList,
    storyCostContext,
    storyOverlapList,
    storyPageDetail,
    storyProjectMarkets,
    storyQueryDetail,
    vi,
    waitFor,
    within,
  };
}
