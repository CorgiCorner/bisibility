import { routerMock, setNavigationState } from "@/tests/next-navigation";
import * as r from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as v from "vitest";
import * as t from "./SearchInsightsBody.test-helpers";
import { SearchInsightsPagesLens } from "./SearchInsightsPagesTable";
import {
  PAGE_LENS_CONTROL_LABEL,
  PAGE_LENS_SEARCH_LABEL,
  PAGE_LENS_TRAFFIC_LABEL,
} from "./search-insights-copy";

v.describe("SearchInsightsBody", () => {
  v.beforeEach(() => {
    t.analyticsMock().track.mockReset();
  });

  v.it.each([
    [PAGE_LENS_TRAFFIC_LABEL, true],
    [PAGE_LENS_SEARCH_LABEL, false],
    [PAGE_LENS_SEARCH_LABEL, null],
  ] as const)(
    "defaults Top pages to %s only when GA4 key events are %s",
    (expectedLens, keyEventsConfigured) => {
      t.renderBody({
        view: t.view({
          organicSessions: {
            importState: null,
            keyEventsConfigured,
            property: "123456789",
            status: "connected",
          },
          sessionsReadable: true,
        }),
      });

      v.expect(r.screen.getByRole("radio", { name: expectedLens })).toBeChecked();
    },
  );

  v.it("does not render a Top pages lens without a joined GA4 property", () => {
    t.renderBody();

    v.expect(r.screen.queryByRole("group", { name: PAGE_LENS_CONTROL_LABEL })).toBeNull();
    v.expect(t.pageColumnHeader(t.pagesCard(), "Impr")).toBeInTheDocument();
  });

  v.it("writes the chosen Top pages lens to the ambient URL and reads it on render", async () => {
    setNavigationState({
      pathname: "/app/prj_1/search-console",
      searchParams: { google: "select", period: "7" },
    });
    const ga4View = t.view({
      organicSessions: {
        importState: null,
        keyEventsConfigured: true,
        property: "123456789",
        status: "connected",
      },
      sessionsReadable: true,
    });
    const { unmount } = t.renderBody({ view: ga4View });

    await userEvent.click(r.screen.getByRole("radio", { name: PAGE_LENS_SEARCH_LABEL }));
    v.expect(routerMock.replace).toHaveBeenCalledWith(
      "/app/prj_1/search-console?google=select&period=7&lens=search",
      { scroll: false },
    );

    unmount();
    setNavigationState({
      pathname: "/app/prj_1/search-console",
      searchParams: { google: "select", lens: "search", period: "7" },
    });
    t.renderBody({ view: ga4View });

    v.expect(r.screen.getByRole("radio", { name: PAGE_LENS_SEARCH_LABEL })).toBeChecked();
    v.expect(t.pageColumnHeader(t.pagesCard(), "Impr")).toBeInTheDocument();
  });

  v.it("makes the Top pages lens reachable and operable by keyboard", async () => {
    setNavigationState({
      pathname: "/app/prj_1/search-console",
      searchParams: { google: "select", period: "7" },
    });
    const user = userEvent.setup();
    r.render(<SearchInsightsPagesLens lens="search" showSessions />);

    const search = r.screen.getByRole("radio", { name: PAGE_LENS_SEARCH_LABEL });
    v.expect(r.screen.getByRole("group", { name: PAGE_LENS_CONTROL_LABEL })).toBeInTheDocument();
    v.expect(search).toBeChecked();
    await user.tab();
    v.expect(search).toHaveFocus();
    await user.keyboard("{ArrowRight}");

    v.expect(routerMock.replace).toHaveBeenCalledWith(
      "/app/prj_1/search-console?google=select&period=7&lens=traffic",
      { scroll: false },
    );
  });
});
