import { SessionSpendProvider } from "@/components/cost-estimate/SessionSpendProvider";
import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { AppHeaderFrame } from "@/components/shell/AppHeaderFrame";
import { ToastProvider } from "@/components/ui/Toast";
import { routerMock, setNavigationState } from "@/tests/next-navigation";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KeywordHeaderCard } from "./KeywordHeaderCard";
import { KeywordHeaderContext } from "./KeywordHeaderContext";
import { KeywordPendingDetail } from "./KeywordPendingDetail";

vi.mock("./KeywordHeaderActions", () => ({
  KeywordHeaderActions: () => <button type="button">Run check</button>,
}));
vi.mock("./KeywordMarketsDrawer", () => ({
  KeywordMarketsDrawer: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Markets and devices" /> : null,
}));

describe("keyword detail shared header", () => {
  it("keeps market and device context in the app header, outside normal and pending result cards", async () => {
    const keyword = {
      ...keywordRows[0],
      checkSchedule: { name: "Daily 06:00", nextCheckAt: null, publicId: "sch_daily" },
    };
    const actions = {
      canUpdateKeyword: true,
      projectMarkets: {
        markets: [
          {
            canonicalKey: keyword.location.canonicalKey,
            countryCode: "US",
            displayName: "United States",
            id: "pmkt_us",
            languageCode: "en",
            languageLabel: "English",
            monthlyCostCents: 0,
            researchAvailable: true,
            status: "active" as const,
          },
        ],
        maxMarkets: 5,
        monthlyCostCents: 0,
        perMarketChecks: 1,
        projectId: "prj_1",
      },
      runCheckNowAction: vi.fn(),
      updateKeywordAction: vi.fn(),
    };

    setNavigationState({ pathname: `/app/prj_1/rank-tracker/${keyword.id}` });
    render(
      <SessionSpendProvider>
        <ToastProvider>
          <AppHeaderFrame
            activeProjectId="prj_1"
            canCreateWorkspace={false}
            context={
              <KeywordHeaderContext
                {...actions}
                addKeywordsMatrixAction={vi.fn()}
                bulkDeleteAction={vi.fn()}
                canCreateKeyword
                keyword={keyword}
                projectId="prj_1"
                targets={[keyword]}
              />
            }
            notificationControl={null}
            projectRef="prj_1"
            workspaces={[]}
          />
          <KeywordHeaderCard {...actions} keyword={keyword} projectId="prj_1" />
          <KeywordPendingDetail
            {...actions}
            keyword={{ ...keyword, hasRankData: false, rankingUrl: null }}
            projectId="prj_1"
            projectRef="prj_1"
            providerConnected
            rankState="not_ranked"
          />
        </ToastProvider>
      </SessionSpendProvider>,
    );

    expect(screen.getAllByRole("button", { name: /United States/ })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "change" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Device" })).toHaveLength(1);
    const header = within(screen.getByRole("banner"));
    expect(header.getByRole("button", { name: /United States/ })).toBeInTheDocument();
    expect(header.getByRole("button", { name: "Device" })).toBeInTheDocument();
    expect(header.getByRole("heading", { name: "Keyword details" })).toBeInTheDocument();
    fireEvent.click(header.getByRole("button", { name: /United States/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Add market" }));
    expect(screen.getByRole("dialog", { name: "Markets and devices" })).toBeVisible();
    expect(routerMock.push).not.toHaveBeenCalled();
  });
});
