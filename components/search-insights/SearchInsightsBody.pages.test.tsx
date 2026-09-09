import { setNavigationState } from "@/tests/next-navigation";
import * as r from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as v from "vitest";
import * as t from "./SearchInsightsBody.test-helpers";
import { SearchInsightsPagesTable } from "./SearchInsightsPagesTable";
import {
  ENGAGEMENT_RATE_TIP,
  KEY_EVENTS_NOT_CONFIGURED,
  KEY_EVENTS_TIP,
  NO_SESSIONS_MATCH_TITLE,
  ORGANIC_SESSIONS_LABEL,
  PAGE_LENS_CONTROL_LABEL,
  PAGE_LENS_SEARCH_LABEL,
  SESSIONS_JOIN_TIP,
  TABLE_CAPTIONS,
} from "./search-insights-copy";

v.describe("SearchInsightsBody", () => {
  v.beforeEach(() => {
    t.analyticsMock().track.mockReset();
  });

  v.it.each([
    [
      "Search",
      "search",
      true,
      ["Page", "Clicks", "Impr", "CTR", "Avg pos", "Actions"],
      ["/guide/0", "300", "9,000", "3.0%", "#8.2", ""],
    ],
    [
      "Traffic with key events configured",
      "traffic",
      true,
      ["Page", "Clicks", ORGANIC_SESSIONS_LABEL, "Engagement", "Key events", "Actions"],
      ["/guide/0", "300", "84", "62.5%", "7", ""],
    ],
    [
      "Traffic without key events configured",
      "traffic",
      false,
      ["Page", "Clicks", ORGANIC_SESSIONS_LABEL, "Engagement", "Avg pos", "Actions"],
      ["/guide/0", "300", "84", "62.5%", "#8.2", ""],
    ],
  ] as const)(
    "keeps %s headers and cells in the same order",
    (_name, lens, keyEventsConfigured, headers, cells) => {
      const row = {
        ...t.pageRows(1)[0],
        engagementRate: 0.625,
        keyEvents: 7,
        sessions: 84,
      };
      r.render(
        <SearchInsightsPagesTable
          keyEventsConfigured={keyEventsConfigured}
          lens={lens}
          rows={[row]}
          showSessions
        />,
      );

      const table = r.screen.getByRole("table", { name: "Top pages" });
      const bodyCells = r.within(r.within(table).getAllByRole("row")[1]).getAllByRole("cell");
      v.expect(
        r
          .within(table)
          .getAllByRole("columnheader")
          .map((header) => header.textContent),
      ).toEqual(headers);
      v.expect(bodyCells.map((cell) => cell.textContent)).toEqual(cells);
    },
  );

  v.it("shows null GA4 funnel metrics as tracked-later values", () => {
    r.render(
      <SearchInsightsPagesTable
        keyEventsConfigured
        lens="traffic"
        rows={[{ ...t.pageRows(1)[0], engagementRate: null, keyEvents: null, sessions: 84 }]}
        showSessions
      />,
    );

    const table = r.screen.getByRole("table", { name: "Top pages" });
    const cells = r.within(r.within(table).getAllByRole("row")[1]).getAllByRole("cell");
    v.expect(cells[3]).toHaveTextContent("-");
    v.expect(r.within(cells[3]).getByTitle(ENGAGEMENT_RATE_TIP)).toHaveTextContent("-");
    v.expect(cells[4]).toHaveTextContent("-");
    v.expect(r.within(cells[4]).getByTitle(KEY_EVENTS_TIP)).toHaveTextContent("-");
  });

  v.it("renders zero sessions with no engagement percentage", () => {
    r.render(
      <SearchInsightsPagesTable
        keyEventsConfigured
        lens="traffic"
        rows={[{ ...t.pageRows(1)[0], engagementRate: null, sessions: 0 }]}
        showSessions
      />,
    );

    const table = r.screen.getByRole("table", { name: "Top pages" });
    const cells = r.within(r.within(table).getAllByRole("row")[1]).getAllByRole("cell");
    v.expect(cells[2]).toHaveTextContent("0");
    v.expect(cells[3]).toHaveTextContent("-");
    v.expect(cells[3]).not.toHaveTextContent("0.0%");
  });

  v.it("leaves engagement and key events as plain headers", () => {
    r.render(
      <SearchInsightsPagesTable
        keyEventsConfigured
        lens="traffic"
        rows={[{ ...t.pageRows(1)[0], engagementRate: 0.625, keyEvents: 7, sessions: 84 }]}
        showSessions
        sort={{ onSort: v.vi.fn(), value: { direction: "desc", key: "clicks" } }}
      />,
    );

    const table = r.screen.getByRole("table", { name: "Top pages" });
    for (const label of [ORGANIC_SESSIONS_LABEL, "Engagement", "Key events"]) {
      const header = r
        .within(table)
        .getAllByRole("columnheader")
        .find((item) => item.textContent === label) as HTMLElement;
      v.expect(header).not.toHaveAttribute("aria-sort");
      v.expect(r.within(header).queryByRole("button")).toBeNull();
    }
  });

  v.it(
    "keeps the not-configured sentence in the Top pages caption and Manage GA4 in the footer",
    () => {
      setNavigationState({ searchParams: { lens: "traffic" } });
      t.renderBody({
        view: t.view({
          organicSessions: {
            importState: null,
            keyEventsConfigured: false,
            property: "123456789",
            status: "connected",
          },
          pages: {
            rows: [{ ...t.pageRows(1)[0], engagementRate: 0.6, keyEvents: 3, sessions: 8 }],
            total: 1,
          },
          sessionsReadable: true,
        }),
      });

      const card = t.pagesCard();
      const heading = r.within(card).getByRole("heading", { name: "Top pages" });
      const manage = r.within(card).getByRole("link", { name: "Manage GA4" });
      v.expect(
        r.within(card).getByText(KEY_EVENTS_NOT_CONFIGURED, { exact: false }),
      ).toBeInTheDocument();
      v.expect(heading.parentElement?.nextElementSibling).not.toContainElement(manage);
      v.expect(manage).toHaveAttribute("href", "/app/prj_1/integrations?connect=ga4");
      v.expect(manage.parentElement).toHaveClass("ms-auto");
      v.expect(t.pageColumnHeaders(card).some((item) => item.textContent === "Key events")).toBe(
        false,
      );
    },
  );

  v.it("puts the Top pages lens on the title row and keeps Manage GA4 in Traffic", () => {
    const connected = {
      importState: null,
      keyEventsConfigured: false as const,
      property: "123456789",
      status: "connected" as const,
    };
    const pages = {
      rows: [{ ...t.pageRows(1)[0], engagementRate: 0.6, keyEvents: 3, sessions: 8 }],
      total: 1,
    };

    setNavigationState({ searchParams: { lens: "search" } });
    const { unmount } = t.renderBody({
      view: t.view({ organicSessions: connected, pages, sessionsReadable: true }),
    });

    const searchCard = t.pagesCard();
    const heading = r.within(searchCard).getByRole("heading", { name: "Top pages" });
    const caption = r.within(searchCard).getByText(TABLE_CAPTIONS.pages);
    const lens = r.within(searchCard).getByRole("group", { name: PAGE_LENS_CONTROL_LABEL });
    const titleGroup = heading.parentElement as HTMLElement;
    const header = titleGroup.parentElement as HTMLElement;
    v.expect(titleGroup).toContainElement(caption);
    v.expect(titleGroup).toHaveClass("gap-1");
    v.expect(header).toHaveClass("items-start", "justify-between");
    v.expect(header).toContainElement(lens);
    v.expect(titleGroup).not.toContainElement(lens);
    v.expect(
      r.screen.getByRole("radio", { name: PAGE_LENS_SEARCH_LABEL }).parentElement?.parentElement,
    ).toHaveClass("min-h-[30px]");
    v.expect(
      r.within(searchCard).queryByRole("link", { name: "Manage GA4" }),
    ).not.toBeInTheDocument();
    v.expect(
      r.within(searchCard).queryByText(KEY_EVENTS_NOT_CONFIGURED, { exact: false }),
    ).not.toBeInTheDocument();
    v.expect(r.within(searchCard).queryByText(" / ")).not.toBeInTheDocument();

    unmount();
    setNavigationState({ searchParams: { lens: "traffic" } });
    t.renderBody({
      view: t.view({ organicSessions: connected, pages, sessionsReadable: true }),
    });

    const trafficCard = t.pagesCard();
    const trafficHeading = r.within(trafficCard).getByRole("heading", { name: "Top pages" });
    const manage = r.within(trafficCard).getByRole("link", { name: "Manage GA4" });
    v.expect(manage).toHaveAttribute("href", "/app/prj_1/integrations?connect=ga4");
    v.expect(manage).toHaveClass("hover:underline");
    v.expect(manage).not.toHaveClass("underline");
    v.expect(trafficHeading.parentElement?.nextElementSibling).not.toContainElement(manage);
    v.expect(manage.parentElement).toHaveClass("ms-auto");
    v.expect(
      r.within(trafficCard).getByText(KEY_EVENTS_NOT_CONFIGURED, { exact: false }),
    ).toBeInTheDocument();
    v.expect(r.within(trafficCard).queryByText(" / ")).not.toBeInTheDocument();
  });

  v.it("does not claim key events are unconfigured when the Admin API result is unknown", () => {
    t.renderBody({
      view: t.view({
        organicSessions: {
          importState: null,
          keyEventsConfigured: null,
          property: "123456789",
          status: "connected",
        },
        pages: {
          rows: [{ ...t.pageRows(1)[0], engagementRate: 0.6, keyEvents: 3, sessions: 8 }],
          total: 1,
        },
        sessionsReadable: true,
      }),
    });

    const card = t.pagesCard();
    v.expect(
      r.within(card).queryByText(KEY_EVENTS_NOT_CONFIGURED, { exact: false }),
    ).not.toBeInTheDocument();
    v.expect(t.pageColumnHeaders(card).some((item) => item.textContent === "Key events")).toBe(
      false,
    );
  });

  v.it("keeps the page link independent of the GA4 funnel", async () => {
    const onOpen = v.vi.fn();
    const row = { ...t.pageRows(1)[0], engagementRate: 0.625, keyEvents: 7, sessions: 84 };
    r.render(
      <SearchInsightsPagesTable
        keyEventsConfigured
        lens="traffic"
        onOpen={onOpen}
        rows={[row]}
        showSessions
      />,
    );

    const link = r.screen.getByTitle(`Open ${row.url}`);
    v.expect(link).toHaveAttribute("href", row.url);
    v.expect(link).toHaveAttribute("target", "_blank");
    await userEvent.click(link);

    v.expect(onOpen).not.toHaveBeenCalled();
  });

  v.it("offers no outbound link for a stored value that is not a web address", () => {
    const stored = "android-app://com.example";
    r.render(
      <SearchInsightsPagesTable rows={[{ ...t.pageRows(1)[0], path: stored, url: stored }]} />,
    );

    v.expect(r.screen.getByText(stored)).toBeInTheDocument();
    v.expect(r.screen.queryByRole("link")).not.toBeInTheDocument();
  });

  v.it("still explains a missing landing-page match", () => {
    r.render(<SearchInsightsPagesTable lens="traffic" rows={[t.pageRows(1)[0]]} showSessions />);

    v.expect(
      t.pageColumnHeader(
        r.screen.getByRole("table", { name: "Top pages" }),
        ORGANIC_SESSIONS_LABEL,
      ),
    ).toHaveAttribute("title", SESSIONS_JOIN_TIP);
    v.expect(r.screen.getByTitle(NO_SESSIONS_MATCH_TITLE)).toHaveTextContent("-");
  });
});
