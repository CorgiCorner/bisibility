import "./virtual-table-test-setup";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import messages from "@/messages/core/en/project-search-insights.json";
import shared from "@/messages/core/en/shared.json";
import { stubResizeObserver } from "@/tests/observers";
import { composeStories } from "@storybook/react";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { drawerDropped, drawerFailed, drawerSteady } from "./history-drawer-fixtures";
import { siteFillingDays, steadyDays } from "./history-fixtures";
import { historyTab } from "./history-tab-fixtures";
import { IndexingDrawer } from "./IndexingDrawer";
import { IndexingReasons } from "./IndexingReasons";
import { IndexingStatus } from "./IndexingStatus";
import { IndexingTrendTooltip } from "./IndexingTrend";
import { TrendColumn, TrendStopMark } from "./IndexingTrendMarks";
import { IndexingUrls } from "./IndexingUrls";
import { indexingData } from "./indexing.test-support";
import * as stories from "./PageIndexing.stories";
import { useIndexingUrls } from "./use-indexing-urls";

it.each(Object.entries(composeStories(stories)))("renders the %s story", (_name, Story) => {
  const { container } = render(<Story />);
  expect(container).not.toBeEmptyDOMElement();
});

function view(children: ReactNode) {
  return render(
    <FeatureMessagesProvider locale="en" timeZone="UTC" messages={{ ...shared, ...messages }}>
      {children}
    </FeatureMessagesProvider>,
  );
}
const data = historyTab(steadyDays);
const action = vi.fn().mockResolvedValue({ data: [data.urls[1]], meta: { next_cursor: null } });
function Urls() {
  const list = useIndexingUrls(data, "p", action);
  return <IndexingUrls data={data} list={list} onOpen={() => undefined} />;
}
it("restores sortable crawl/change columns and sends the 7-day filter to the server", async () => {
  view(<Urls />);
  const table = screen.getByRole("table", { name: "URLs" });
  expect(within(table).getByRole("columnheader", { name: "Last crawl" })).toBeInTheDocument();
  expect(within(table).getByRole("columnheader", { name: "Change" })).toBeInTheDocument();
  expect(within(table).getByText(/Dropped out Oct 20/)).toBeInTheDocument();
  expect(
    within(table).getByRole("button", { name: drawerDropped.url }).closest('[role="cell"]'),
  ).not.toHaveStyle({ position: "sticky" });
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Change" }));
  await user.click(screen.getByRole("menuitem", { name: "Changed in the last 7 days" }));
  expect(action).toHaveBeenLastCalledWith({
    projectId: "p",
    query: {
      page: 1,
      limit: 50,
      sort_by: "url",
      sort_direction: "asc",
      history: "true",
      changed_since: "2026-10-16T06:00:00.000Z",
    },
  });
});
it("uses the same change in the chart marker, tooltip, drawer and URL fixture", () => {
  const day = steadyDays.find((day) => day.date === "2026-10-20");
  expect(day).toBeDefined();
  if (!day) return;
  expect(day.changes.entries[0].url).toBe(drawerDropped.url);
  expect(data.urls[1].history?.changes).toEqual(drawerDropped.history?.changes);
  view(
    <>
      <svg>
        <TrendColumn x={0} y={10} width={12} height={10} top payload={day} />
      </svg>
      <IndexingTrendTooltip
        day={{
          ...day,
          changes: { count: 8, entries: Array.from({ length: 5 }, () => day.changes.entries[0]) },
        }}
      />
    </>,
  );
  expect(document.querySelector('[data-changes="1"]')).toHaveAttribute("d", "M6,0l4,4l-4,4l-4,-4Z");
  expect(
    screen.getAllByText("Submitted and indexed -> Crawled - currently not indexed"),
  ).toHaveLength(5);
  expect(screen.getByText("and 3 more")).toBeInTheDocument();
});
it("shows each reason's own oldest result and a magnitude bar in its group hue", () => {
  view(<IndexingReasons report={data.report} onSelect={() => undefined} />);
  const reason = screen.getByText("Submitted and indexed");
  expect(reason.closest('[role="row"]')).toHaveTextContent("Sep 28");
  const bar = reason.querySelector("[aria-hidden] > span") as HTMLElement;
  expect(bar.style.width).toBe("100%");
  expect(bar.style.background).toBe("var(--green)");
  expect(screen.getByRole("columnheader", { name: "As of" })).toBeInTheDocument();
});
it("combines exhausted quota and partial report into one callout and omits the current year", () => {
  view(
    <IndexingStatus
      data={{ ...indexingData, allowance: { limit: 50, used: 50, remaining: 0 } }}
      projectId="p"
      canInspect
      onInspect={() => undefined}
    />,
  );
  expect(screen.getAllByRole("status")).toHaveLength(1);
  expect(screen.getByRole("status")).toHaveTextContent(
    "Daily inspection quota exhausted. The report is still partial. Checks can resume after Oct 23",
  );
  expect(screen.getByRole("status")).not.toHaveTextContent("2026");
});
it("includes the year when the result and status now have different viewer years", () => {
  view(
    <IndexingStatus
      data={{ ...indexingData, now: new Date("2027-10-23T06:00:00Z") }}
      projectId="p"
      canInspect
      onInspect={() => undefined}
    />,
  );
  expect(screen.getByText(/Oldest result/)).toHaveTextContent("2026");
});
it.each([
  [drawerDropped, "URL is not on Google"],
  [drawerSteady, "URL is on Google"],
  [drawerFailed, "Inspection failed"],
] as const)("uses Search Console verdict words for $0.group", (detail, label) => {
  view(<IndexingDrawer detail={detail} onClose={() => undefined} />);
  expect(screen.getByText("Verdict").nextElementSibling).toHaveTextContent(label);
});

it("fills the desktop card and keeps columns unpinned in a mobile viewport", () => {
  const observers = stubResizeObserver();
  view(<Urls />);
  const table = screen.getByRole("table", { name: "URLs" });
  const resize = (width: number) =>
    act(() => {
      Object.defineProperty(table, "clientWidth", { configurable: true, value: width });
      for (const observer of observers)
        observer.trigger([
          { target: table, contentRect: { width, height: 500 } } as unknown as ResizeObserverEntry,
        ]);
    });
  resize(1440);
  expect(table).toHaveStyle("--dt-col-url: 960px; --dt-table-width: 1440px");
  resize(343);
  expect(table).toHaveStyle("--dt-col-url: 140px; --dt-col-state: 200px; --dt-table-width: 620px");
  expect(within(table).getByRole("columnheader", { name: "Indexing state" })).not.toHaveStyle({
    position: "sticky",
  });
});
it("distinguishes a filled change diamond from a quota tick without color", () => {
  const day = { ...steadyDays[0], stop: "quota" as const, changes: { count: 1, entries: [] } };
  const { container } = render(
    <svg>
      <TrendColumn x={10} y={20} width={12} height={40} top payload={day} />
      <TrendStopMark x={10} y={0} width={12} height={100} payload={day} />
    </svg>,
  );
  expect(container.querySelector("[data-changes]")).toHaveAttribute("d", "M16,10l4,4l-4,4l-4,-4Z");
  expect(container.querySelector('[data-stop="quota"]')).toHaveAttribute("d", "M12,105h8v2h-8Z");
});
it("retains fresh stored results separately from the beginning of history", () => {
  expect(data.report.oldestResultAt?.toISOString()).toBe("2026-09-28T06:00:00.000Z");
  expect(data.report.newestResultAt).toEqual(data.now);
  expect(data.days?.[0].date).toBe("2026-07-26");
  const reasons = data.report.groups.flatMap((group) => group.reasons);
  const dates = reasons.flatMap((reason) =>
    reason.oldestResultAt ? [reason.oldestResultAt.getTime()] : [],
  );
  expect(new Set(dates).size).toBeGreaterThan(4);
  expect(Math.min(...dates)).toBe(data.report.oldestResultAt?.getTime());
  expect(new Date(Math.max(...dates)).toISOString()).toBe("2026-10-12T06:00:00.000Z");
  for (const row of data.urls) {
    const reason = reasons.find((reason) => reason.coverageState === row.coverageState);
    expect(row.checkedAt?.getTime()).toBeGreaterThanOrEqual(reason?.oldestResultAt?.getTime() ?? 0);
    expect(row.checkedAt?.getTime()).toBeLessThanOrEqual(data.now?.getTime() ?? 0);
    if (row.lastCrawlAt)
      expect(row.lastCrawlAt.getTime()).toBeLessThanOrEqual(row.checkedAt?.getTime() ?? 0);
  }
});
it("fills the sitemap with no more than 50 daily checks and matching quota ticks", () => {
  const filling = historyTab(siteFillingDays);
  expect(filling.settings.inspectionDailyLimit).toBe(50);
  expect(filling.settings.todayCount).toBe(50);
  expect(filling.report.todayCount).toBe(50);
  let previous = 0;
  for (const day of siteFillingDays) {
    expect(day.checked - previous).toBe(day.inspectedThatDay);
    expect(day.inspectedThatDay).toBeLessThanOrEqual(50);
    expect(day.stop === "quota").toBe(day.inspectedThatDay === 50);
    previous = day.checked;
  }
  expect(previous).toBe(864);
});
