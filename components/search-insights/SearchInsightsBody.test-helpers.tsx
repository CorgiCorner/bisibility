import { view } from "./search-insights-row-test-fixtures";

export { deferred, pageRows, queryRows, view } from "./search-insights-row-test-fixtures";

import { ToastProvider } from "@/components/ui/Toast";
import type { LoadSearchInsightsRowsAction } from "@/lib/actions/search-insights-rows";
import type { SearchInsightsImportState } from "@/lib/search-insights/queries/context";
import type { SearchInsightsFirstView } from "@/lib/search-insights/queries/first-view";
import type { SearchInsightsSignals } from "@/lib/search-insights/queries/signals";
import { render, screen, within } from "@testing-library/react";
import { vi } from "vitest";
import { SearchInsightsBody } from "./SearchInsightsBody";
import { SearchInsightsSessionsCard } from "./SearchInsightsSessionsCard";
import { SearchInsightsSignalChips } from "./SearchInsightsSignalChips";
import { storySignals } from "./search-insights-story-fixtures";

const mocks = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@/lib/analytics/client", () => ({ track: mocks.track }));

export function analyticsMock() {
  return mocks;
}

export type RowsPageOutcome = Awaited<ReturnType<LoadSearchInsightsRowsAction>>;

export type BodyOptions = {
  ga4Card?: React.ReactNode;
  importState?: SearchInsightsImportState | null;
  loadRowsAction?: LoadSearchInsightsRowsAction;
  onTrack?: (row: { query: string }) => void;
  period?: string;
  property?: string;
  signals?: SearchInsightsSignals;
  view?: SearchInsightsFirstView;
};

export function body(options: BodyOptions = {}) {
  const loadRowsAction =
    options.loadRowsAction ?? ((async () => ({ kind: "pages", rows: [], total: 0 })) as never);
  const currentView = options.view ?? view();
  return (
    <ToastProvider>
      <SearchInsightsBody
        importState={options.importState ?? null}
        loadRowsAction={loadRowsAction}
        onTrack={options.onTrack}
        period={options.period ?? "28"}
        projectId="prj_1"
        property={options.property ?? "sc-domain:example.com"}
        signalChips={
          <SearchInsightsSignalChips
            ga4Card={
              options.ga4Card ??
              (currentView.organicSessions.status === "not_connected" ? (
                <SearchInsightsSessionsCard projectId="prj_1" />
              ) : null)
            }
            namedQueryCount={currentView.queries.total}
            signals={options.signals ?? storySignals}
          />
        }
        view={currentView}
      />
    </ToastProvider>
  );
}

export function renderBody(options: BodyOptions = {}) {
  return render(body(options));
}

export function queriesCard() {
  return screen.getByRole("heading", { name: "Top queries" }).closest("section") as HTMLElement;
}

export function pagesCard() {
  return screen.getByRole("heading", { name: "Top pages" }).closest("section") as HTMLElement;
}

export function pageColumnHeaders(card: HTMLElement) {
  return within(card).getAllByRole("columnheader");
}

export function pageColumnHeader(card: HTMLElement, label: string) {
  const header = pageColumnHeaders(card).find((item) => item.textContent === label);
  if (!header) throw new Error(`Top pages header ${label} is missing`);
  return header;
}
