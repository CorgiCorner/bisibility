import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import KeywordDetailPage from "./page";

const mocks = vi.hoisted(() => ({
  getKeywordDetail: vi.fn(),
  getKeywordTagSuggestions: vi.fn(),
  getProjectCostContext: vi.fn(),
  requireReadableProject: vi.fn(),
  resolveProjectAccess: vi.fn(),
}));

vi.mock("@/components/keywords/KeywordHeaderCard", () => ({ KeywordHeaderCard: () => null }));
vi.mock("@/components/keywords/KeywordMetricCards", () => ({ KeywordMetricCards: () => null }));
vi.mock("@/components/keywords/KeywordPendingDetail", () => ({
  KeywordPendingDetail: () => <div data-testid="pending-detail" />,
}));
vi.mock("@/components/keywords/KeywordTrafficCard", () => ({
  KeywordTrafficCard: () => <div data-testid="traffic-card" />,
}));
vi.mock("@/components/keywords/PositionHistoryCard", () => ({ PositionHistoryCard: () => null }));
vi.mock("@/components/keywords/RankingUrlHistory", () => ({ RankingUrlHistory: () => null }));
vi.mock("@/lib/actions/alerts", () => ({ createKeywordAlertRule: vi.fn() }));
vi.mock("@/lib/actions/keyword", () => ({
  addKeywords: vi.fn(),
  bulkDeleteKeywords: vi.fn(),
  updateKeyword: vi.fn(),
}));
vi.mock("@/lib/actions/keyword-schedule", () => ({ updateKeywordSchedule: vi.fn() }));
vi.mock("@/lib/actions/rankCheck", () => ({ runCheckNow: vi.fn() }));
vi.mock("@/lib/queries/_auth", () => ({
  requireReadableProject: mocks.requireReadableProject,
  resolveProjectAccess: mocks.resolveProjectAccess,
}));
vi.mock("@/lib/queries/cost-calculator", () => ({
  getProjectCostContext: mocks.getProjectCostContext,
}));
vi.mock("@/lib/queries/keywords", () => ({
  getKeywordDetail: mocks.getKeywordDetail,
  getKeywordTagSuggestions: mocks.getKeywordTagSuggestions,
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));

describe("KeywordDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveProjectAccess.mockResolvedValue({
      mode: "member",
      projectId: "project_1",
      publicId: "prj_1",
    });
    mocks.getKeywordTagSuggestions.mockResolvedValue([]);
    mocks.getProjectCostContext.mockResolvedValue({ costPerCheckCents: null });
    mocks.requireReadableProject.mockResolvedValue({
      actor: {
        id: "user_1",
        memberships: [{ projectId: "project_1", role: "owner" }],
      },
      project: { id: "project_1" },
    });
  });

  it("renders traffic below pending rank-check detail", async () => {
    mocks.getKeywordDetail.mockResolvedValue({
      checkState: "never_checked",
      hasRankData: false,
      providerConnected: false,
      traffic: { hasAnalyticsConnection: false, pages: [], query: null },
    });

    render(
      await KeywordDetailPage({
        params: Promise.resolve({ id: "kw_pending", project: "prj_1" }),
      }),
    );

    const pending = screen.getByTestId("pending-detail");
    const traffic = screen.getByTestId("traffic-card");
    expect(pending.nextElementSibling).toBe(traffic);
    expect(mocks.getKeywordDetail).toHaveBeenCalledWith("prj_1", "kw_pending");
    expect(mocks.getProjectCostContext).toHaveBeenCalledWith("prj_1");
    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_1");
  });
});
