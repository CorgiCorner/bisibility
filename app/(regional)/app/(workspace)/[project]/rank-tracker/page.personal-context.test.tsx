import { emptyTablePresentation } from "@/lib/saved-views/presentation-model";
import {
  captured,
  getPageMocks,
  getPagePersonalPreferences,
  getPageReportOptions,
  renderPage,
  setupPageActor,
  setupPageDefaultView,
  setupPageTest,
} from "@/tests/rank-tracker-page";
import {
  PAGE_ACTOR_ID,
  PAGE_PROJECT_REF,
  pagePreference,
  pageView,
} from "@/tests/rank-tracker-page-fixtures";
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

const mocks = getPageMocks();
function registry(count: number) {
  mocks.getProjectMarkets.mockResolvedValue({
    markets: Array.from({ length: count }, (_, i) => ({ id: `pmkt_${i}`, status: "active" })),
  });
}

beforeEach(setupPageTest);
describe("actual personal context in the Rank Tracker RSC page", () => {
  it("keeps an empty General URL readable with its session and revision-zero preference", async () => {
    await renderPage({});
    expect(screen.getByTestId("tracked-grid")).toBeInTheDocument();
    expect(captured.notice).toBeNull();
    const context = getPagePersonalPreferences();
    expect(context).toMatchObject({
      preference: { projectId: PAGE_PROJECT_REF, revision: 0, surface: "keywords" },
      presentation: null,
      views: [],
    });
    expect(context.scopeKey).toMatch(/^[a-f0-9]{64}$/);
    expect(mocks.listSessionSavedViews).toHaveBeenCalledWith(PAGE_PROJECT_REF, "keywords");
    expect(mocks.getPersonalSurfacePreference).toHaveBeenCalledWith(PAGE_PROJECT_REF, "keywords");
    expect(getPageReportOptions().context).toEqual({
      actor: { id: PAGE_ACTOR_ID },
      transport: "session",
    });
    expect(mocks.getRankTrackerKeywordList.mock.calls[0]?.[1]).toBe(getPageReportOptions());
  });

  it("uses an available private saved-v2 default without exposing owner fields", async () => {
    const view = setupPageDefaultView();
    await renderPage({});
    expect(captured.gridProps).toMatchObject({
      activeViewId: view.id,
      query: {
        grouped: true,
        pageSize: 100,
        search: "service",
        lens: { device: "mobile", locationId: "krakow" },
        filters: { tags: ["Service"] },
      },
    });
    expect(getPagePersonalPreferences().views).toEqual([view]);
    expect(getPagePersonalPreferences().preference.defaultTarget).toEqual({
      kind: "saved_view",
      viewId: view.id,
    });
    expect(JSON.stringify(getPagePersonalPreferences())).not.toContain('"ownerId"');
    expect(mocks.getRankTrackerKeywordList).not.toHaveBeenCalled();
    expect(mocks.getRankTrackerGroupedList).toHaveBeenCalledOnce();
  });

  it.each([0, 1, 2])(
    "keeps explicit false over a private saved-v2 default with %i markets",
    async (count) => {
      setupPageDefaultView();
      registry(count);
      await renderPage({ grouped: "0", q: "", tags: "", location: "", wrongUrl: "0" });
      expect(captured.gridProps.query).toMatchObject({
        grouped: false,
        search: "",
        lens: { device: "mobile", locationId: null },
        filters: { tags: [], wrongUrl: false },
      });
      expect(mocks.getRankTrackerKeywordList).toHaveBeenCalledOnce();
      expect(mocks.getRankTrackerGroupedList).not.toHaveBeenCalled();
    },
  );

  it.each([0, 1, 2])(
    "retains automatic grouping for an explicit shared v1 view with %i markets",
    async (count) => {
      const view = pageView(1);
      registry(count);
      mocks.listSessionSavedViews.mockResolvedValue([view]);
      await renderPage({ view: view.id });
      expect(captured.gridProps.query).toMatchObject({
        grouped: count > 1,
        savedViewId: view.id,
        search: "service",
        lens: { device: "mobile", locationId: "krakow" },
        filters: { tags: ["Service"] },
      });
      expect(
        count > 1 ? mocks.getRankTrackerGroupedList : mocks.getRankTrackerKeywordList,
      ).toHaveBeenCalledOnce();
      expect(
        count > 1 ? mocks.getRankTrackerKeywordList : mocks.getRankTrackerGroupedList,
      ).not.toHaveBeenCalled();
    },
  );

  it("allows an explicit private saved-v2 link and honors its false grouping definition", async () => {
    const view = pageView(2, false);
    registry(2);
    mocks.listSessionSavedViews.mockResolvedValue([view]);
    await renderPage({ view: view.id });
    expect(captured.gridProps.query).toMatchObject({ grouped: false, savedViewId: view.id });
    expect(mocks.getRankTrackerKeywordList).toHaveBeenCalledOnce();
    expect(mocks.getRankTrackerGroupedList).not.toHaveBeenCalled();
  });

  it("lets explicit empty view return to automatic General despite a private default", async () => {
    setupPageDefaultView(2, false);
    registry(2);
    await renderPage({ view: "" });
    expect(captured.gridProps).toMatchObject({
      activeViewId: null,
      query: { grouped: true, savedViewId: null, search: "" },
    });
  });

  it("uses personal presentation on the default route and saved presentation for an explicit link", async () => {
    const view = setupPageDefaultView();
    const presentation = {
      ...structuredClone(emptyTablePresentation),
      visibility: { volume: false },
    };
    mocks.getPersonalSurfacePreference.mockResolvedValue({
      ...pagePreference(),
      defaultTarget: { kind: "saved_view", viewId: view.id },
      revision: 3,
      presentation,
    });
    const first = await renderPage({});
    expect(captured.presentation).toEqual(presentation);
    expect(getPagePersonalPreferences().preference.revision).toBe(3);
    first.unmount();
    await renderPage({ view: view.id });
    expect(captured.presentation).toEqual(
      view.config.version === 2 ? view.config.presentation : null,
    );
  });

  it("binds scope custody to the verified actor while ignoring a URL userId", async () => {
    const first = await renderPage({});
    const firstScope = getPagePersonalPreferences().scopeKey;
    first.unmount();
    const same = await renderPage({ userId: "another-user", q: "different query" });
    expect(getPagePersonalPreferences().scopeKey).toBe(firstScope);
    same.unmount();
    setupPageActor("another-user");
    await renderPage({});
    expect(getPagePersonalPreferences().scopeKey).not.toBe(firstScope);
    expect(getPageReportOptions().context).toEqual({
      actor: { id: "another-user" },
      transport: "session",
    });
  });
});
