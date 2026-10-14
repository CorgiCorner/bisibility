import {
  captured,
  getPageMocks,
  getPageReportOptions,
  renderPage,
  setupPageTest,
} from "@/tests/rank-tracker-page";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = getPageMocks();

describe("KeywordsPage automatic project-market grouping", () => {
  beforeEach(setupPageTest);

  function projectMarkets(count: number) {
    mocks.getProjectMarkets.mockResolvedValue({
      markets: Array.from({ length: count }, (_, index) => ({
        id: `pmkt_${index}`,
        status: "active",
      })),
      maxMarkets: 5,
      monthlyCostCents: 0,
      perMarketChecks: 0,
      projectId: "prj_1",
    });
  }

  it.each([0, 1, 2])(
    "renders the automatic mode for %i registered markets without a manual choice",
    async (count) => {
      projectMarkets(count);
      await renderPage({});
      expect(captured.gridProps.query).toMatchObject({ grouped: count > 1 });
      expect(
        count > 1 ? mocks.getRankTrackerGroupedList : mocks.getRankTrackerKeywordList,
      ).toHaveBeenCalledOnce();
      expect(
        count > 1 ? mocks.getRankTrackerKeywordList : mocks.getRankTrackerGroupedList,
      ).not.toHaveBeenCalled();
      expect(
        count > 1 ? mocks.getRankTrackerGroupedList : mocks.getRankTrackerKeywordList,
      ).toHaveBeenCalledWith(
        { projectRef: "prj_1", query: expect.objectContaining({ grouped: count > 1 }) },
        getPageReportOptions(),
      );
      expect(mocks.getProjectMarkets).toHaveBeenCalledOnce();
    },
  );

  it.each([0, 1, 2])(
    "preserves the validated explicit URL choice with %i registered markets",
    async (count) => {
      projectMarkets(count);
      const grouped = count <= 1;
      await renderPage({ grouped: grouped ? "1" : "0" });
      expect(captured.gridProps.query).toMatchObject({ grouped });
      expect(
        grouped ? mocks.getRankTrackerGroupedList : mocks.getRankTrackerKeywordList,
      ).toHaveBeenCalledOnce();
      expect(
        grouped ? mocks.getRankTrackerKeywordList : mocks.getRankTrackerGroupedList,
      ).not.toHaveBeenCalled();
      expect(
        grouped ? mocks.getRankTrackerGroupedList : mocks.getRankTrackerKeywordList,
      ).toHaveBeenCalledWith(
        { projectRef: "prj_1", query: expect.objectContaining({ grouped }) },
        getPageReportOptions(),
      );
    },
  );

  it("groups from the registry even before its second market has keywords", async () => {
    projectMarkets(2);
    await renderPage({});
    expect(mocks.getRankTrackerGroupedList).toHaveBeenCalledWith(
      { projectRef: "prj_1", query: expect.objectContaining({ grouped: true }) },
      getPageReportOptions(),
    );
    expect(mocks.getRankTrackerKeywordList).not.toHaveBeenCalled();
  });
});

it("waits for the registry before choosing a row query, avoiding a temporary flat render", async () => {
  setupPageTest();
  let resolveMarkets!: (value: { markets: { id: string; status: "active" }[] }) => void;
  mocks.getProjectMarkets.mockReturnValue(
    new Promise((resolve) => {
      resolveMarkets = resolve;
    }),
  );
  const pendingPage = renderPage({});
  await vi.waitFor(() => expect(mocks.getProjectMarkets).toHaveBeenCalled());
  expect(mocks.getRankTrackerKeywordList).not.toHaveBeenCalled();
  expect(mocks.getRankTrackerGroupedList).not.toHaveBeenCalled();
  resolveMarkets({
    markets: [
      { id: "pmkt_1", status: "active" },
      { id: "pmkt_2", status: "active" },
    ],
  });
  await pendingPage;
  expect(captured.gridProps.query).toMatchObject({ grouped: true });
  expect(mocks.getRankTrackerKeywordList).not.toHaveBeenCalled();
});
