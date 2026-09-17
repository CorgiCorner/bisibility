import { captured, getPageMocks, renderPage, setupPageTest } from "@/tests/rank-tracker-page";
import { beforeEach, describe, expect, it } from "vitest";

const mocks = getPageMocks();

describe("KeywordsPage grouped tabs", () => {
  beforeEach(setupPageTest);

  it("uses grouped server rows when grouping is explicit", async () => {
    await renderPage({ grouped: "1" });

    expect(mocks.getRankTrackerGroupedList).toHaveBeenCalledWith({
      projectRef: "prj_1",
      query: expect.objectContaining({ grouped: true }),
    });
    expect(mocks.getRankTrackerKeywordList).not.toHaveBeenCalled();
    expect(captured.gridProps.query).toMatchObject({ grouped: true });
  });

  it("defaults to grouped server rows when project locations span two markets", async () => {
    mocks.getRankTrackerKeywordList.mockResolvedValueOnce({
      facets: { intents: [], positions: [], tags: [], topics: [] },
      locations: [
        { count: 1, displayName: "Spain", id: "country:es@es", kind: "country" },
        { count: 1, displayName: "United States", id: "country:us@en", kind: "country" },
      ],
      matchedTargetCount: 2,
      page: 1,
      pageCount: 1,
      pageSize: 25,
      resolvedLens: { device: "all", locationId: null },
      rows: [],
      totalCount: 2,
    });

    await renderPage({});

    expect(mocks.getRankTrackerGroupedList).toHaveBeenCalledWith({
      projectRef: "prj_1",
      query: expect.objectContaining({ grouped: true }),
    });
    expect(captured.gridProps.query).toMatchObject({ grouped: true });
  });
});
