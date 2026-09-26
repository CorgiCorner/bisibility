import { renderWithSearchInsightsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { routerMock, setNavigationState } from "@/tests/next-navigation";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchInsightsPagesLens } from "./SearchInsightsPagesTable";

describe("SearchInsightsPagesLens", () => {
  beforeEach(() => {
    vi.spyOn(window.history, "replaceState");
    setNavigationState({
      pathname: "/app/prj_1/search-console",
      searchParams: { google: "select", period: "7" },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    routerMock.replace.mockReset();
    routerMock.push.mockReset();
    routerMock.refresh.mockReset();
  });

  it("replaces only the URL, so the tables keep their search, sort and page", async () => {
    render(<SearchInsightsPagesLens lens="search" showSessions />);

    await userEvent.click(screen.getByRole("radio", { name: "Traffic" }));

    expect(window.history.replaceState).toHaveBeenCalledWith(
      window.history.state,
      "",
      "/app/prj_1/search-console?google=select&period=7&lens=traffic",
    );
    expect(routerMock.replace).not.toHaveBeenCalled();
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });

  it("does nothing when the active lens is chosen again", async () => {
    render(<SearchInsightsPagesLens lens="search" showSessions />);

    await userEvent.click(screen.getByRole("radio", { name: "Search" }));

    expect(window.history.replaceState).not.toHaveBeenCalled();
  });
});
