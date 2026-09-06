import { SessionSpendProvider } from "@/components/cost-estimate/SessionSpendProvider";
import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { ToastProvider } from "@/components/ui";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KeywordHeaderCard } from "./KeywordHeaderCard";
import { KeywordPendingDetail } from "./KeywordPendingDetail";

vi.mock("./KeywordHeaderActions", () => ({
  KeywordHeaderActions: () => <button type="button">Run check</button>,
}));
vi.mock("./KeywordMarketsDrawer", () => ({
  KeywordMarketsDrawer: () => null,
}));

describe("keyword detail shared header", () => {
  it("renders the same target switcher and schedule change affordance for normal and pending paths", () => {
    const keyword = {
      ...keywordRows[0],
      checkSchedule: { name: "Daily 06:00", nextCheckAt: null, publicId: "sch_daily" },
    };
    const actions = {
      canUpdateKeyword: true,
      runCheckNowAction: vi.fn(),
      updateKeywordAction: vi.fn(),
    };

    render(
      <SessionSpendProvider>
        <ToastProvider>
          <KeywordHeaderCard
            {...actions}
            bulkDeleteAction={vi.fn()}
            canCreateKeyword={false}
            keyword={keyword}
            projectId="prj_1"
          />
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

    expect(screen.getAllByRole("button", { name: /United States/ })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "change" })).toHaveLength(2);
    expect(screen.getAllByText("1 targets")).toHaveLength(2);
  });
});
