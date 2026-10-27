import "./virtual-table-test-setup";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import type { IndexingDay } from "@/lib/search-index/ui-model";
import messages from "@/messages/core/en/project-search-insights.json";
import shared from "@/messages/core/en/shared.json";
import { stubResizeObserver } from "@/tests/observers";
import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it } from "vitest";
import {
  drawerDropped,
  drawerFailed,
  drawerFlapping,
  drawerManual,
  drawerSteady,
  drawerToday,
} from "./history-drawer.test-support";
import {
  fillingDays,
  firstDays,
  longDays,
  pausedDays,
  singleSnapshot,
  siteFillingDays,
  snapshot,
  steadyDays,
  thirdDays,
} from "./history-fixtures";
import { groupSitemaps, historyStrip, trendDays, trendTicks } from "./history-presentation";
import { historyTab } from "./history-tab.test-support";
import { IndexingDrawer } from "./IndexingDrawer";
import { IndexingHistoryStrip } from "./IndexingHistoryStrip";
import { IndexingSitemaps } from "./IndexingSitemaps";
import { IndexingTrend, IndexingTrendTooltip } from "./IndexingTrend";
import { TrendColumn, TrendStopMark } from "./IndexingTrendMarks";

function view(children: ReactNode) {
  return render(
    <FeatureMessagesProvider locale="en" timeZone="UTC" messages={{ ...shared, ...messages }}>
      {children}
    </FeatureMessagesProvider>,
  );
}
it("starts with 89 unchecked days and the first baseline at the end", () => {
  const days = historyStrip(drawerToday, "2026-10-24");
  expect(days.filter((day) => day.state === "not_checked")).toHaveLength(89);
  expect(days.at(-1)).toEqual({ date: "2026-10-24", state: "indexed" });
});
it("uses the same viewer calendar day as the History list across midnight", () => {
  const detail = {
    ...drawerToday,
    history: {
      complete: true,
      changes: [{ at: new Date("2026-10-24T00:30:00Z"), previous: {}, next: { verdict: "PASS" } }],
    },
  };
  const days = historyStrip(detail, "2026-10-24", "Pacific/Honolulu");
  expect(days.filter((day) => day.state === "indexed")).toHaveLength(2);
  expect(days.at(-2)?.date).toBe("2026-10-23");
});
it("holds state between changes without inferring a state before the baseline", () => {
  const days = historyStrip(drawerDropped, "2026-10-23");
  expect(days.find((day) => day.date === "2026-09-01")?.state).toBe("not_checked");
  expect(days.find((day) => day.date === "2026-09-02")?.state).toBe("indexed");
  expect(days.find((day) => day.date === "2026-10-19")?.state).toBe("indexed");
  expect(days.find((day) => day.date === "2026-10-20")?.state).toBe("not_indexed");
  expect(days.filter((day) => day.state === "indexed")).toHaveLength(48);
});
it("retains the last known Google state after our inspection fails", () => {
  expect(historyStrip(drawerFailed, "2026-10-23")).toEqual(
    historyStrip(drawerSteady, "2026-10-23"),
  );
  view(<IndexingDrawer detail={drawerFailed} onClose={() => undefined} />);
  expect(screen.getByText(/Our inspection failed at/)).toBeInTheDocument();
  expect(screen.getByRole("img", { name: /41 indexed days/ })).toBeInTheDocument();
});
it("handles a baseline older than the visible window and ignores future transitions", () => {
  const detail = {
    ...drawerFlapping,
    history: {
      complete: true,
      changes: [
        { at: new Date("2026-01-01"), previous: {}, next: { verdict: "PASS" } },
        { at: new Date("2026-12-01"), previous: {}, next: { verdict: "NEUTRAL" } },
      ],
    },
  };
  expect(historyStrip(detail, "2026-10-23").every((day) => day.state === "indexed")).toBe(true);
});
it("does not turn a failure history row into a Google transition", () => {
  const detail = {
    ...drawerSteady,
    history: {
      complete: true,
      changes: [
        ...(drawerSteady.history?.changes ?? []),
        {
          at: new Date("2026-10-22"),
          previous: {},
          next: { verdict: null, inspectionError: "TIMEOUT" },
        },
      ],
    },
  };
  expect(historyStrip(detail, "2026-10-23").at(-1)?.state).toBe("indexed");
});
it("exposes dates and state counts without relying on color", () => {
  view(<IndexingHistoryStrip detail={drawerToday} />);
  expect(screen.getByRole("img")).toHaveAccessibleName(
    "Jul 27, 2026 to Oct 24, 2026: 1 indexed days, 0 not indexed days, 89 not checked days.",
  );
});
it("shows on-demand provenance for a single manual inspection", () => {
  view(<IndexingDrawer detail={drawerManual} onClose={() => undefined} />);
  expect(screen.getByText("On demand")).toBeInTheDocument();
  expect(drawerManual.history?.changes).toHaveLength(1);
});
it("maps only stored days and keeps off slots empty without changing stored counts", () => {
  const mapped = trendDays(pausedDays);
  expect(mapped).toHaveLength(30);
  expect(mapped.filter((day) => day.stop === "off")).toHaveLength(5);
  for (const day of mapped.filter((day) => day.stop === "off")) {
    expect(day.plottedIndexed + day.plottedNotIndexed).toBe(0);
    expect(day.checked).toBe(1270);
  }
  expect(trendDays(firstDays)).toHaveLength(1);
  expect(trendDays(thirdDays)).toHaveLength(3);
});
it("shows only the latest 90 days and keeps the actual beginning in the caption", () => {
  expect(trendDays(longDays)).toHaveLength(90);
  expect(trendDays(longDays)[0].date).toBe(longDays[30].date);
  expect(trendTicks(longDays.slice(-90))).toHaveLength(5);
  view(<IndexingTrend days={longDays} />);
  expect(screen.getByText("History since Jun 26")).toBeInTheDocument();
  expect(screen.queryByText(/Sept/)).not.toBeInTheDocument();
});
it("renders an empty line without chart axes until history exists", () => {
  const { container } = view(<IndexingTrend days={[]} />);
  expect(screen.getByText(/Nothing inspected yet/)).toBeInTheDocument();
  expect(container.querySelector("svg")).toBeNull();
});
it.each(["off", "quota"] as const)(
  "explains %s stops with tooltip text and a muted marker",
  (stop) => {
    const day: IndexingDay = { ...pausedDays[0], stop };
    view(<IndexingTrendTooltip day={day} />);
    expect(
      screen.getByText(stop === "off" ? "No inspections: mode off" : "Daily quota reached"),
    ).toBeInTheDocument();
    expect(screen.getByText("Checked 1,270 of 1,270 URLs")).toBeInTheDocument();
    const { container } = render(
      <svg>
        <TrendStopMark payload={day} x={10} y={0} width={8} height={100} />
      </svg>,
    );
    const mark = container.querySelector(`[data-stop="${stop}"]`);
    expect(mark).not.toBeNull();
    expect(mark).toHaveAttribute(stop === "off" ? "stroke" : "fill", "var(--fg-muted)");
  },
);
it("draws no stop marker on ordinary days and rounds an indexed-only column", () => {
  const { container } = render(
    <svg>
      <TrendStopMark payload={firstDays[0]} />
      <TrendColumn
        x={0}
        y={0}
        width={20}
        height={30}
        payload={{ ...firstDays[0], notIndexed: 0 }}
        top={false}
      />
    </svg>,
  );
  expect(container.querySelector("[data-stop]")).toBeNull();
  expect(container.querySelector("path")?.getAttribute("d")).toContain("Q0,0 4,0");
});
it("renders one stop mark for each paused or quota-limited day in the real chart", () => {
  const observers = stubResizeObserver();
  const resize = () =>
    act(() => {
      for (const observer of observers)
        observer.trigger([{ contentRect: { width: 600, height: 220 } } as ResizeObserverEntry]);
    });
  const viewResult = view(<IndexingTrend days={pausedDays} />);
  resize();
  expect(viewResult.container.querySelectorAll('[data-stop="off"]')).toHaveLength(5);
  viewResult.unmount();
  const quotaResult = view(<IndexingTrend days={fillingDays} />);
  resize();
  expect(quotaResult.container.querySelectorAll('[data-stop="quota"]')).toHaveLength(
    fillingDays.filter((day) => day.stop === "quota").length,
  );
});
it("uses locale month and day ordering in day tooltips", () => {
  view(<IndexingTrendTooltip day={{ ...firstDays[0], date: "2026-09-09" }} />);
  expect(screen.getByText("Sep 9")).toBeInTheDocument();
});
it("shows the explicit incomplete coverage count", () => {
  view(<IndexingTrend days={fillingDays} complete={false} />);
  expect(
    screen.getByText("Still checking: 3,612 of 5,000 URLs not checked yet"),
  ).toBeInTheDocument();
});
it("groups children directly under their index even if provider rows arrive shuffled", () => {
  const rows = groupSitemaps([...snapshot.rows.slice(1), snapshot.rows[0]]);
  expect(rows.map((row) => row.path)).toEqual(snapshot.rows.map((row) => row.path));
  expect(rows.map((row) => row.depth)).toEqual([0, 1, 1, 1]);
  for (const key of ["indexed", "notIndexed", "failed", "notChecked"] as const)
    expect(snapshot.rows.slice(1).reduce((sum, row) => sum + row.checks[key], 0)).toBe(
      snapshot.rows[0].checks[key],
    );
  expect(snapshot.rows.slice(1).reduce((sum, row) => sum + row.submitted, 0)).toBe(1240);
});
it("retains orphaned rows", () => {
  expect(groupSitemaps(snapshot.rows.slice(1))).toHaveLength(3);
});
it("shows the index total, pending child and complete accessible checks", () => {
  view(<IndexingSitemaps snapshot={snapshot} />);
  expect(screen.getByText("Index of 3")).toBeInTheDocument();
  expect(screen.getByText("1,240 total")).toBeInTheDocument();
  expect(screen.getByText("Pending")).toBeInTheDocument();
  expect(
    screen.getByRole("img", {
      name: "584 indexed, 246 not indexed, 0 failed inspections, 410 not checked",
    }),
  ).toHaveAttribute("title", "584 indexed, 246 not indexed, 0 failed inspections, 410 not checked");
});
it("preserves successful rows and shows both read timestamps after permission failure", () => {
  view(
    <IndexingSitemaps
      snapshot={{ ...snapshot, lastError: "permission", lastErrorAt: "2026-10-24T06:00:00Z" }}
    />,
  );
  expect(screen.getByRole("alert").textContent).toMatch(
    /Permission denied.*Oct 24, 2026.*Oct 23, 2026/,
  );
  expect(screen.getByText("1,240 total")).toBeInTheDocument();
});
it("distinguishes not yet read from a successfully read empty list", () => {
  const first = view(<IndexingSitemaps snapshot={{ ...snapshot, readAt: null, rows: [] }} />);
  expect(screen.getByText("Sitemaps have not been read yet.")).toBeInTheDocument();
  first.unmount();
  view(<IndexingSitemaps snapshot={{ ...snapshot, rows: [] }} />);
  expect(
    screen.getByText("No sitemap is submitted for this property in Search Console."),
  ).toBeInTheDocument();
});
it("shows errors and warnings together and retains checks on removed sitemaps", () => {
  view(
    <IndexingSitemaps
      snapshot={{
        ...singleSnapshot,
        rows: singleSnapshot.rows.map((row) => ({
          ...row,
          noLongerSubmitted: true,
          errors: 2,
          warnings: 5,
        })),
      }}
    />,
  );
  for (const label of ["2 errors", "5 warnings", "No longer submitted", "412 of 512 indexed"])
    expect(screen.getByText(label)).toBeInTheDocument();
});
it.each(
  [firstDays, thirdDays, siteFillingDays, steadyDays, pausedDays, longDays].map(
    (days) => [days] as const,
  ),
)("keeps tab totals and latest summary consistent", (days) => {
  const data = historyTab(days);
  const latest = days.at(-1);
  expect(data.report.groups.reduce((sum, group) => sum + group.total, 0)).toBe(data.report.total);
  expect(data.report.checked).toBe(latest?.checked);
  expect(data.report.groups[0].total).toBe(latest?.indexed);
  expect(data.report.groups[1].total).toBe(latest?.notIndexed);
  expect(data.sitemapSnapshot?.rows[0].submitted).toBe(1240);
  for (const row of data.sitemapSnapshot?.rows ?? [])
    expect(Object.values(row.checks).reduce((sum, count) => sum + count, 0)).toBe(row.submitted);
});

it("uses uncapped stored strip rows even when the visible history is truncated", () => {
  const detail = {
    ...drawerToday,
    history: { changes: [], complete: false },
    stripChanges: drawerToday.history?.changes,
  };
  expect(historyStrip(detail, "2026-10-24")).toEqual(historyStrip(drawerToday, "2026-10-24"));
});
