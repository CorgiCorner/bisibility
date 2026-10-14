import {
  captured,
  getPageMocks,
  getPagePersonalPreferences,
  renderPage,
  setupPageDefaultView,
  setupPageTest,
} from "@/tests/rank-tracker-page";
import { pagePreference, pageView } from "@/tests/rank-tracker-page-fixtures";
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

const mocks = getPageMocks();
beforeEach(setupPageTest);
describe("read-only RSC refusal and neutral personal-default metadata", () => {
  it("keeps a missing private reference unavailable and hides its old name", async () => {
    const view = pageView();
    mocks.listSessionSavedViews.mockResolvedValue([]);
    await renderPage({ view: view.id });
    expect(captured.notice).toMatchObject({ status: "unavailable_view" });
    expect(screen.queryByText(view.name)).not.toBeInTheDocument();
    expect(screen.queryByTestId("tracked-grid")).not.toBeInTheDocument();
    expect(mocks.getRankTrackerKeywordList).not.toHaveBeenCalled();
    expect(mocks.getRankTrackerGroupedList).not.toHaveBeenCalled();
    expect(mocks.createSessionRankTrackerReportOptions).not.toHaveBeenCalled();
  });

  it("does not run the list for missing retained scope or malformed URL", async () => {
    setupPageDefaultView();
    mocks.scopeLocations.mockResolvedValue([]);
    mocks.scopeTags.mockResolvedValue([]);
    const missing = await renderPage({});
    expect(captured.notice).toMatchObject({ status: "unavailable_scope" });
    expect(mocks.getRankTrackerGroupedList).not.toHaveBeenCalled();
    missing.unmount();
    await renderPage({ grouped: "not-a-mode" });
    expect(captured.notice).toMatchObject({ status: "invalid_url" });
    expect(mocks.getRankTrackerKeywordList).not.toHaveBeenCalled();
    expect(mocks.getRankTrackerGroupedList).not.toHaveBeenCalled();
  });

  it("keeps a returned foreign-project view outside the current selection", async () => {
    const view = pageView();
    mocks.listSessionSavedViews.mockResolvedValue([{ ...view, projectId: "prj_foreign" }]);
    await renderPage({ view: view.id });
    expect(captured.notice).toMatchObject({ status: "unavailable_view" });
    expect(screen.queryByText(view.name)).not.toBeInTheDocument();
    expect(mocks.getRankTrackerKeywordList).not.toHaveBeenCalled();
    expect(mocks.getRankTrackerGroupedList).not.toHaveBeenCalled();
  });

  it("stops before preference/scope/list reads when the mocked membership port refuses", async () => {
    mocks.requireReadableProject.mockRejectedValue(
      new Error("Injected fixture membership refusal"),
    );
    await expect(renderPage({})).rejects.toThrow("Injected fixture membership refusal");
    expect(mocks.listSessionSavedViews).not.toHaveBeenCalled();
    expect(mocks.getPersonalSurfacePreference).not.toHaveBeenCalled();
    expect(mocks.scopeLocations).not.toHaveBeenCalled();
    expect(mocks.scopeMarkets).not.toHaveBeenCalled();
    expect(mocks.scopeTags).not.toHaveBeenCalled();
    expect(mocks.getRankTrackerKeywordList).not.toHaveBeenCalled();
    expect(mocks.getRankTrackerGroupedList).not.toHaveBeenCalled();
    expect(mocks.createSessionRankTrackerReportOptions).not.toHaveBeenCalled();
  });

  it("forwards neutral notice for an inaccessible retained default while leaving its stored record untouched", async () => {
    const view = pageView();
    const stored = {
      ...pagePreference(),
      defaultTarget: { kind: "saved_view" as const, viewId: view.id },
      revision: 6,
    };
    mocks.getPersonalSurfacePreference.mockResolvedValue(stored);
    mocks.listSessionSavedViews.mockResolvedValue([]);
    await renderPage({});
    expect(captured.notice).toBeNull();
    expect(captured.gridProps).toMatchObject({
      activeViewId: null,
      query: { savedViewId: null, search: "" },
    });
    expect(getPagePersonalPreferences().preference).toMatchObject({
      defaultTarget: null,
      notice: "unavailable_default",
      revision: 6,
      schemaVersion: 1,
    });
    expect(JSON.stringify(getPagePersonalPreferences())).not.toContain(view.id);
    expect(getPagePersonalPreferences().views).toEqual([]);
    expect(screen.queryByText(view.name)).not.toBeInTheDocument();
    expect(stored).toMatchObject({
      defaultTarget: { kind: "saved_view", viewId: view.id },
      notice: null,
      revision: 6,
    });
  });

  it("forwards an already mapped tombstone notice without an inaccessible name or stale ID", async () => {
    mocks.getPersonalSurfacePreference.mockResolvedValue({
      ...pagePreference(),
      notice: "unavailable_default",
      revision: 4,
    });
    await renderPage({});
    expect(getPagePersonalPreferences().preference).toMatchObject({
      defaultTarget: null,
      notice: "unavailable_default",
      revision: 4,
    });
    expect(captured.gridProps).toMatchObject({ activeViewId: null, query: { savedViewId: null } });
    expect(getPagePersonalPreferences().views).toEqual([]);
  });
});
