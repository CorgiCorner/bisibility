import { permanentRedirect, redirect } from "@/tests/next-navigation";
import {
  captured,
  getPageMocks,
  renderPage,
  renderPageAt,
  setupPageTest,
} from "@/tests/rank-tracker-page";
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

const mocks = getPageMocks();

describe("KeywordsPage tabs", () => {
  beforeEach(setupPageTest);

  it("keeps Tracked as the default branch and renders both counts", async () => {
    await renderPage({});

    expect(screen.getByTestId("rank-tracker-tabs")).toHaveTextContent("tracked:9:2");
    expect(screen.getByTestId("tracked-grid")).toBeInTheDocument();
    expect(screen.queryByTestId("saved-workspace")).not.toBeInTheDocument();
    expect(captured.initialAction).toBeNull();
    expect(captured.initialDensity).toBe("standard");
    expect(mocks.getRankTrackerKeywordList).toHaveBeenCalledWith({
      projectRef: "prj_1",
      query: expect.objectContaining({ grouped: false, page: 1 }),
    });
    expect(mocks.getRankTrackerGroupedList).not.toHaveBeenCalled();
    expect(captured.gridProps.query).toMatchObject({ grouped: false });
    expect(mocks.getCheckHealth).toHaveBeenCalledWith("prj_1");
    expect(mocks.isProviderConnected).toHaveBeenCalledWith("prj_1", "gsc");
    expect(mocks.loadRankTrackerCostContext).toHaveBeenCalledWith("prj_1");
    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_1");
  });

  it("promotes the legacy market lens to the market route", async () => {
    mocks.resolveLegacyMarketRef.mockResolvedValue("pmkt_one");

    await expect(renderPage({ market: "location_internal_1", tab: "saved" })).rejects.toThrow(
      "NEXT_REDIRECT:/app/prj_1/m/pmkt_one/rank-tracker?tab=saved",
    );
    expect(mocks.resolveLegacyMarketRef).toHaveBeenCalledWith("project_1", "location_internal_1");
  });

  it("drops a legacy market value this project cannot resolve", async () => {
    await expect(renderPage({ market: "loc_gone" })).rejects.toThrow(
      "NEXT_REDIRECT:/app/prj_1/rank-tracker",
    );
  });

  it("leaves the market route alone, so the segment is never undone by the legacy lens", async () => {
    await renderPageAt({ market: "pmkt_one", project: "prj_1" }, { market: "loc_frankfurt" });

    expect(permanentRedirect).not.toHaveBeenCalled();
    expect(mocks.resolveLegacyMarketRef).not.toHaveBeenCalled();
  });

  it("canonicalizes stale saved-view identity and preserves explicit and orthogonal state", async () => {
    await expect(
      renderPage({
        action: "filter",
        add: "1",
        q: "",
        tab: "tracked",
        tags: "",
        view: "viw_stale",
      }),
    ).rejects.toThrow("NEXT_REDIRECT:");
    const href = String(redirect.mock.calls[0]?.[0]);
    expect(href).not.toContain("view=");
    expect(href).toContain("q=");
    expect(href).toContain("tags=");
    expect(href).toContain("tab=tracked");
    expect(href).toContain("add=1");
    expect(href).toContain("action=filter");
  });

  it("canonicalizes a stale location once and accepts the canonical reload", async () => {
    await expect(
      renderPage({ action: "filter", location: "stale", q: "kept", tab: "tracked" }),
    ).rejects.toThrow("NEXT_REDIRECT:");
    const href = String(redirect.mock.calls[0]?.[0]);
    expect(href).toContain("location=");
    expect(href).not.toContain("location=stale");
    expect(href).toContain("q=kept");
    expect(href).toContain("tab=tracked");
    expect(href).toContain("action=filter");

    redirect.mockClear();
    await renderPage(Object.fromEntries(new URL(href, "https://example.com").searchParams));
    expect(redirect).not.toHaveBeenCalled();
  });

  it("passes each validated action and rejects unknown input", async () => {
    for (const action of ["add", "import", "export", "filter"] as const) {
      await renderPage({ action });
      expect(captured.initialAction).toBe(action);
    }
    await renderPage({ action: "run-check" });
    expect(captured.initialAction).toBeNull();
    await renderPage({ action: "unknown" });
    expect(captured.initialAction).toBeNull();
  });

  it("renders the Saved branch for the ?tab=saved deep link", async () => {
    await renderPage({ tab: "saved" });

    expect(screen.getByTestId("saved-workspace")).toHaveTextContent("9:2");
    expect(screen.queryByTestId("tracked-grid")).not.toBeInTheDocument();
    expect(mocks.listSavedKeywords).toHaveBeenCalledWith("prj_1");
    expect(mocks.loadRankTrackerCostContext).toHaveBeenCalledWith("prj_1");
    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_1");
  });

  it.each(["runs", "checks"] as const)(
    "migrates ?tab=%s to the rank-check Runs list",
    async (tab) => {
      await expect(renderPage({ tab })).rejects.toThrow("NEXT_REDIRECT:");

      expect(redirect).toHaveBeenCalledWith("/app/prj_1/runs?source=rank_checks");
    },
  );

  it("maps planned runs without carrying the retired rank cursor", async () => {
    await expect(
      renderPage({ cursor: "rank_cursor", segment: "planned", tab: "runs" }),
    ).rejects.toThrow("NEXT_REDIRECT:");

    expect(redirect).toHaveBeenCalledWith("/app/prj_1/runs?view=planned&source=rank_checks");
  });

  it("maps history to Runs instead of the Finished filter", async () => {
    await expect(renderPage({ segment: "history", tab: "runs" })).rejects.toThrow("NEXT_REDIRECT:");

    expect(redirect).toHaveBeenCalledWith("/app/prj_1/runs?source=rank_checks");
  });

  it("does not loop the migration through another rank-tracker URL", async () => {
    await expect(renderPage({ segment: "planned", tab: "checks" })).rejects.toThrow(
      "NEXT_REDIRECT:",
    );

    const destination = String(redirect.mock.calls[0]?.[0]);
    expect(destination).toBe("/app/prj_1/runs?view=planned&source=rank_checks");
    expect(destination).not.toContain("rank-tracker");
    expect(destination).not.toContain("tab=");
    expect(destination).not.toContain("segment=");
  });

  it("does not invent an rcr detail from a check run query", async () => {
    await expect(
      renderPage({ run: "check_abcdefghijklmnopqrstuvwx", tab: "runs" }),
    ).rejects.toThrow("NEXT_REDIRECT:");

    expect(redirect).toHaveBeenCalledWith("/app/prj_1/runs?source=rank_checks");
  });

  it("keeps a strict rcr query as a rank-check detail", async () => {
    await expect(renderPage({ run: "rcr_abcdefghijklmnopqrstuvwx", tab: "runs" })).rejects.toThrow(
      "NEXT_REDIRECT:",
    );

    expect(redirect).toHaveBeenCalledWith(
      "/app/prj_1/runs/rank-checks/rcr_abcdefghijklmnopqrstuvwx",
    );
  });
});
