import type { RankTrackerQueryState } from "@/lib/keywords/rank-tracker-query-types";
import { appPath } from "@/lib/routing/app-path";
import { getPageMocks, renderPage, setupPageTest } from "@/tests/rank-tracker-page";
import { PAGE_PROJECT_REF, pageFlatList } from "@/tests/rank-tracker-page-fixtures";
import { screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const local = vi.hoisted(() => vi.fn());
vi.mock("@/lib/queries/rank-tracker-local-list", () => ({ loadRankTrackerLocalList: local }));
beforeEach(() => {
  setupPageTest();
  local.mockImplementation(async (_project: string, query: RankTrackerQueryState) => ({
    ...pageFlatList(query),
    query,
    local: {
      context: { state: "missing", choices: [], selection: null },
      facts: [],
      summary: null,
      unsupportedFilters: false,
    },
  }));
});

it("installs a Local recovery link for the authorized page project without collecting evidence", async () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  try {
    await renderPage({ reportView: "local" });
    expect(screen.getByRole("link", { name: "Manage businesses and assignments" })).toHaveAttribute(
      "href",
      appPath(PAGE_PROJECT_REF, "settings", "business-locations"),
    );
    expect(getPageMocks().requireReadableProject).toHaveBeenCalledWith(PAGE_PROJECT_REF);
    expect(local).toHaveBeenCalledWith(
      PAGE_PROJECT_REF,
      expect.objectContaining({ reportScope: expect.objectContaining({ view: "local" }) }),
      expect.any(Object),
    );
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
  }
});
