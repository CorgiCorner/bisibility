import "./virtual-table-test-setup";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import en from "@/messages/core/en/project-search-insights.json";
import shared from "@/messages/core/en/shared.json";
import es from "@/messages/core/es-ES/project-search-insights.json";
import ja from "@/messages/core/ja/project-search-insights.json";
import pl from "@/messages/core/pl/project-search-insights.json";
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
} from "./history-drawer-fixtures";
import {
  fillingDays,
  firstDays,
  pausedDays,
  siteFillingDays,
  steadyDays,
} from "./history-fixtures";
import { pausedRanges, trendValueTicks } from "./history-presentation";
import { historyTab } from "./history-tab-fixtures";
import { IndexingDrawer } from "./IndexingDrawer";
import { IndexingHistoryStrip } from "./IndexingHistoryStrip";
import { IndexingStatus } from "./IndexingStatus";
import { IndexingHistoryLine } from "./IndexingStoredFacts";
import { IndexingSummary } from "./IndexingSummary";
import { IndexingTrend, IndexingTrendTooltip } from "./IndexingTrend";

function view(children: ReactNode) {
  return render(
    <FeatureMessagesProvider locale="en" timeZone="UTC" messages={{ ...shared, ...en }}>
      {children}
    </FeatureMessagesProvider>,
  );
}
it.each([
  [0, [0, 1]],
  [24, [0, 10, 20, 30]],
  [30, [0, 10, 20, 30]],
  [1388, [0, 500, 1000, 1500]],
  [5000, [0, 2000, 4000, 6000]],
])("uses round ticks for %i", (maximum, expected) => {
  expect(trendValueTicks(maximum as number)).toEqual(expected);
});
it("uses the round values on the rendered y axis", () => {
  const observers = stubResizeObserver();
  const result = view(<IndexingTrend days={fillingDays} />);
  act(() => {
    for (const observer of observers)
      observer.trigger([{ contentRect: { width: 600, height: 220 } } as ResizeObserverEntry]);
  });
  const maximum = Math.max(...fillingDays.map((day) => day.indexed + day.notIndexed));
  expect(
    [
      ...result.container.querySelectorAll(
        ".recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value",
      ),
    ].map((tick) => tick.textContent),
  ).toEqual(trendValueTicks(maximum).map((value) => new Intl.NumberFormat("en").format(value)));
});
it("explains quota ticks only when a quota day is visible", () => {
  const result = view(<IndexingTrend days={fillingDays} />);
  const mark = screen.getByText("Daily quota reached").querySelector("svg path");
  expect(mark).toHaveAttribute("d", "M0,3h8v2H0Z");
  expect(mark).toHaveAttribute("fill", "var(--fg-muted)");
  result.unmount();
  view(<IndexingTrend days={[{ ...steadyDays[0], stop: "quota" }, ...steadyDays]} />);
  expect(screen.queryByText("Daily quota reached")).not.toBeInTheDocument();
});
it("explains each contiguous paused range below the chart", () => {
  expect(pausedRanges(pausedDays)).toEqual([{ start: "2026-10-05", end: "2026-10-09" }]);
  view(<IndexingTrend days={pausedDays} />);
  expect(screen.getByText("No inspections Oct 5 - Oct 9: mode off")).toBeInTheDocument();
});
it.each([
  ["en", en],
  ["pl", pl],
  ["es-ES", es],
  ["ja", ja],
] as const)(
  "formats calendar keys in %s without shifting days in a non-UTC zone",
  (locale, messages) => {
    render(
      <FeatureMessagesProvider
        locale={locale}
        timeZone="Pacific/Honolulu"
        messages={{ ...shared, ...messages }}
      >
        <IndexingTrendTooltip day={{ ...firstDays[0], date: "2026-09-09" }} />
        <IndexingHistoryStrip detail={drawerToday} />
      </FeatureMessagesProvider>,
    );
    const date = (key: string, year = false) =>
      new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        ...(year ? { year: "numeric" } : {}),
        timeZone: "UTC",
      }).format(new Date(`${key}T00:00:00Z`));
    expect(screen.getByText(date("2026-09-09"))).toBeInTheDocument();
    expect(screen.getByText(date("2026-10-24", true))).toBeInTheDocument();
    expect(messages.projectSearchInsights.indexing).not.toHaveProperty("months");
  },
);
it("includes the year on chart dates when the stored range crosses a year", () => {
  view(
    <IndexingTrend
      days={[
        { ...firstDays[0], date: "2025-12-31" },
        { ...firstDays[0], date: "2026-01-01" },
      ]}
    />,
  );
  expect(screen.getByText("History since Dec 31, 2025")).toBeInTheDocument();
});
it.each([drawerToday, drawerSteady, drawerDropped, drawerFlapping, drawerFailed, drawerManual])(
  "places the history strip before the facts for $url",
  (detail) => {
    view(<IndexingDrawer detail={detail} onClose={() => undefined} />);
    const strip = screen.getByRole("img");
    const facts = screen.getByText("Inspection status");
    expect(strip.compareDocumentPosition(facts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const latest = detail.history?.changes[0].next as { coverageState: string; verdict: string };
    expect(detail.coverageState).toBe(latest.coverageState);
    expect(detail.verdict).toBe(latest.verdict);
  },
);
it("shows coverage transitions and a baseline in one line each", () => {
  view(<IndexingDrawer detail={drawerDropped} onClose={() => undefined} />);
  expect(
    screen.getByText("Oct 20, 2026: Submitted and indexed -> Crawled - currently not indexed"),
  ).toBeInTheDocument();
  expect(
    screen.getByText("Sep 2, 2026: first inspection, Submitted and indexed"),
  ).toBeInTheDocument();
  expect(screen.queryByText("Previous")).not.toBeInTheDocument();
});
it("falls back to verdict when coverage did not change", () => {
  const change = {
    at: new Date("2026-10-20T06:00:00Z"),
    previous: { coverageState: "Unchanged", verdict: "PASS" },
    next: { coverageState: "Unchanged", verdict: "NEUTRAL" },
  };
  view(<IndexingHistoryLine change={change} timeZone="UTC" />);
  expect(screen.getByText("Oct 20, 2026: Passed -> Neutral")).toBeInTheDocument();
});
it("grows coverage within 50 inspections per day, then varies with the Oct 20 drop", () => {
  let previous = 0;
  for (const day of steadyDays) {
    expect(day.inspectedThatDay).toBeLessThanOrEqual(50);
    expect(day.checked - previous).toBeLessThanOrEqual(50);
    previous = day.checked;
  }
  expect(new Set(steadyDays.map((day) => day.indexed)).size).toBeGreaterThan(25);
  const before = steadyDays.find((day) => day.date === "2026-10-19");
  const after = steadyDays.find((day) => day.date === "2026-10-20");
  expect(after?.indexed).toBe((before?.indexed ?? 0) - 1);
  expect(after?.notIndexed).toBe((before?.notIndexed ?? 0) + 1);
});
it("renders the complete steady tab without partial or still-checking text", () => {
  const data = historyTab(steadyDays);
  expect(data.report.total).toBe(1270);
  expect(data.report.complete).toBe(true);
  view(
    <>
      <IndexingStatus data={data} projectId="p" canInspect onInspect={() => undefined} />
      <IndexingTrend days={data.days} complete={data.report.complete} />
    </>,
  );
  expect(screen.queryByText(/This report is partial/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Still checking/)).not.toBeInTheDocument();
});
it("keeps four totals in two columns in a narrow container", () => {
  const { container } = view(<IndexingSummary report={historyTab(steadyDays).report} />);
  expect(container.querySelector("dl")).toHaveClass("grid-cols-2", "@min-[640px]:grid-cols-4");
});

it("preserves the reviewed reason breakdown at the filling snapshot", () => {
  const data = historyTab(siteFillingDays);
  expect(data.report.groups.map((group) => group.total)).toEqual([612, 248, 4, 406]);
  expect(data.report.groups[0].reasons.map((reason) => reason.total)).toEqual([584, 28]);
  expect(data.report.groups[1].reasons.map((reason) => reason.total)).toEqual([
    140, 61, 18, 12, 11, 6,
  ]);
});
it("keeps all site snapshots, reason subtotals and 30 outside targets consistent", () => {
  for (const latest of [...firstDays, ...siteFillingDays, ...steadyDays, ...pausedDays]) {
    const data = historyTab([latest]);
    const rows = data.sitemapSnapshot?.rows ?? [];
    expect(data.report.total).toBe(1270);
    expect(latest.indexed + latest.notIndexed + latest.failed).toBe(latest.checked);
    expect(data.report.remaining + data.report.checked).toBe(1270);
    for (const group of data.report.groups) {
      expect(group.reasons.reduce((sum, reason) => sum + reason.total, 0)).toBe(group.total);
      expect(group.checked + group.remaining).toBe(group.total);
    }
    const root = rows[0];
    const children = rows.slice(1);
    expect(root.submitted).toBe(1240);
    for (const key of ["indexed", "notIndexed", "failed", "notChecked"] as const)
      expect(children.reduce((sum, row) => sum + row.checks[key], 0)).toBe(root.checks[key]);
    for (const row of rows) {
      expect(Object.values(row.checks).reduce((sum, value) => sum + value, 0)).toBe(row.submitted);
      expect(Object.values(row.checks).every((value) => value >= 0)).toBe(true);
    }
    const outside = [
      latest.indexed - root.checks.indexed,
      latest.notIndexed - root.checks.notIndexed,
      latest.failed - root.checks.failed,
      data.report.remaining - root.checks.notChecked,
    ];
    expect(outside.every((value) => value >= 0)).toBe(true);
    expect(outside.reduce((sum, value) => sum + value, 0)).toBe(30);
    expect(data.settings.todayCount).toBe(latest.inspectedThatDay);
    expect(data.report.todayCount).toBe(latest.inspectedThatDay);
    expect(data.allowance.used).toBe(latest.inspectedThatDay);
    expect(data.settings.inspectionDailyLimit).toBeGreaterThanOrEqual(latest.inspectedThatDay);
  }
});
it("keeps the eight reviewed URLs and the duplicate canonical", () => {
  const data = historyTab(steadyDays);
  expect(data.urls).toHaveLength(8);
  const duplicate = data.urls.find((row) => row.url.endsWith("?ref=nav"));
  expect(duplicate?.googleCanonical).toBe("https://example.com/docs/rank-tracking");
  expect(data.urls.every((row) => row.checkedAt && row.group !== "not_checked")).toBe(true);
});
