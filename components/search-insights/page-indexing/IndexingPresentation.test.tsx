import "./virtual-table-test-setup";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import en from "@/messages/core/en/project-search-insights.json";
import shared from "@/messages/core/en/shared.json";
import es from "@/messages/core/es-ES/project-search-insights.json";
import ja from "@/messages/core/ja/project-search-insights.json";
import pl from "@/messages/core/pl/project-search-insights.json";
import { render, screen, within } from "@testing-library/react";
import { createTranslator } from "next-intl";
import type { ReactNode } from "react";
import { expect, it } from "vitest";
import { IndexingDrawer } from "./IndexingDrawer";
import { IndexingReasons } from "./IndexingReasons";
import { IndexingStatus } from "./IndexingStatus";
import { IndexingSummary } from "./IndexingSummary";
import { IndexingUrls } from "./IndexingUrls";
import { indexingData, indexingUrl } from "./indexing.test-support";
import { SearchConsoleTabs } from "./SearchConsoleTabs";
import { useIndexingUrls } from "./use-indexing-urls";

function wrapper(children: ReactNode, polish = false) {
  return (
    <FeatureMessagesProvider
      locale={polish ? "pl" : "en"}
      timeZone="Pacific/Honolulu"
      messages={{ ...shared, ...(polish ? pl : en) }}
    >
      {children}
    </FeatureMessagesProvider>
  );
}
it("shows one zero per group without percentages when no URLs exist", () => {
  const report = {
    ...indexingData.report,
    groups: indexingData.report.groups.map((group) => ({ ...group, total: 0 })),
  };
  const view = render(wrapper(<IndexingSummary report={report} />));
  const counts = view.container.querySelectorAll("dd");
  expect(counts).toHaveLength(4);
  for (const count of counts) expect(count.textContent?.trim()).toBe("0");
});

it("retains meaningful group percentages when URLs exist", () => {
  const report = {
    ...indexingData.report,
    groups: indexingData.report.groups.map((group, index) => ({
      ...group,
      total: index === 0 ? 3 : index === 1 ? 1 : 0,
    })),
  };
  const view = render(wrapper(<IndexingSummary report={report} />));
  const counts = view.container.querySelectorAll("dd");
  expect(counts[0]).toHaveTextContent("3 75%");
  expect(counts[1]).toHaveTextContent("1 25%");
});

it("translates every documented enum in the Polish drawer including history and rich results", () => {
  const history = {
    verdict: "NEUTRAL",
    indexingState: "INDEXING_ALLOWED",
    robotsTxtState: "ALLOWED",
    pageFetchState: "SUCCESSFUL",
    crawledAs: "MOBILE",
  };
  render(
    wrapper(
      <IndexingDrawer
        detail={{
          ...indexingUrl,
          history: {
            complete: true,
            changes: [
              {
                at: new Date("2026-10-23T06:00:00Z"),
                previous: history,
                next: { verdict: "PASS" },
              },
            ],
          },
        }}
        onClose={() => undefined}
      />,
      true,
    ),
  );
  const dialog = screen.getByRole("dialog");
  for (const constant of [
    "NEUTRAL",
    "MOBILE",
    "SUCCESSFUL",
    "ALLOWED",
    "INDEXING_ALLOWED",
    "PASS",
  ]) {
    expect(within(dialog).queryByText(constant, { exact: true })).not.toBeInTheDocument();
  }
  expect(within(dialog).getAllByText("Googlebot na smartfony").length).toBeGreaterThan(0);
  expect(within(dialog).getAllByText("Indeksowanie dozwolone").length).toBeGreaterThan(0);
});
it("retains an unknown enum and renders empty values as a hyphen", () => {
  render(
    wrapper(
      <IndexingDrawer
        detail={{ ...indexingUrl, verdict: "FUTURE_VERDICT", crawledAs: "" }}
        onClose={() => undefined}
      />,
    ),
  );
  expect(screen.getByText("URL is not on Google")).toBeInTheDocument();
  const label = screen.getByText("Crawled as");
  expect(label.nextElementSibling).toHaveTextContent("-");
});
it("status, drawer and history format the same instant in the viewer zone", () => {
  const instant = new Date("2026-10-23T06:00:00Z");
  render(
    wrapper(
      <>
        <IndexingStatus
          data={{ ...indexingData, settings: { ...indexingData.settings, nextResetAt: instant } }}
          projectId="p"
          canInspect
          onInspect={() => undefined}
        />
        <IndexingDrawer
          detail={{
            ...indexingUrl,
            checkedAt: instant,
            history: { complete: true, changes: [{ at: instant, previous: {}, next: {} }] },
          }}
          onClose={() => undefined}
        />
      </>,
    ),
  );
  const date = screen.getByText("Last inspected").nextElementSibling?.textContent ?? "";
  expect(date).not.toBe("");
  const shortDate = new Intl.DateTimeFormat("en", {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(instant);
  expect(screen.getByText(/midnight Pacific/)).toHaveTextContent(`${shortDate} your time`);
  const historyDate = new Intl.DateTimeFormat("en", {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    dateStyle: "medium",
  }).format(instant);
  expect(
    within(screen.getByRole("dialog")).getByText(`${historyDate}: first inspection, -`),
  ).toBeInTheDocument();
  const viewerDate = new Intl.DateTimeFormat("en", {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(instant);
  expect(date).toBe(viewerDate);
});
it("omits an unknown count from the tab including its accessible name", () => {
  render(
    wrapper(
      <SearchConsoleTabs
        active="performance"
        base="/app/p/search-console"
        query=""
        notIndexed={null}
      />,
    ),
  );
  const link = screen.getByRole("link", { name: "Page indexing beta" });
  expect(within(link).getByText("beta")).toBeVisible();
  expect(link).not.toHaveAttribute("aria-label");
});
it.each([
  ["en", en, "beta"],
  ["es-ES", es, "beta"],
  ["ja", ja, "ベータ"],
  ["pl", pl, "beta"],
] as const)("includes the visible beta badge in the %s tab name", (locale, catalog, label) => {
  render(
    <FeatureMessagesProvider locale={locale} timeZone="UTC" messages={{ ...shared, ...catalog }}>
      <SearchConsoleTabs
        active="page-indexing"
        base="/app/p/search-console"
        query=""
        notIndexed={248}
      />
    </FeatureMessagesProvider>,
  );
  const link = screen.getByRole("link", { current: "page" });
  expect(within(link).getByText(label)).toBeVisible();
  expect(link).toHaveAccessibleName(new RegExp(label));
  expect(link).toHaveAccessibleName(new RegExp(catalog.projectSearchInsights.indexing.title));
  expect(link).toHaveAccessibleName(/248/);
});
function PolishFilters() {
  const data = {
    ...indexingData,
    report: {
      ...indexingData.report,
      groups: indexingData.report.groups.map((group) => ({
        ...group,
        reasons:
          group.group === "not_indexed"
            ? [{ coverageState: "Unspecified", total: 1, oldestResultAt: null }]
            : [],
      })),
    },
  };
  const list = useIndexingUrls(data, "p", async () => ({ data: [], meta: { next_cursor: null } }));
  return (
    <>
      <IndexingReasons report={data.report} onSelect={() => undefined} />
      <IndexingUrls data={data} list={list} onOpen={() => undefined} />
    </>
  );
}
it("localizes Unspecified in reason rows and coverage options", async () => {
  const { fireEvent } = await import("@testing-library/react");
  render(wrapper(<PolishFilters />, true));
  expect(screen.getByText("Nieokreślona przyczyna")).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: pl.projectSearchInsights.indexing.coverageState }),
  );
  expect(screen.getByRole("menuitem", { name: "Nieokreślona przyczyna" })).toBeInTheDocument();
  expect(screen.queryByText("Unspecified")).not.toBeInTheDocument();
});
it.each([
  ["en", en, ["1 page", "2 pages", "5 pages"], "1 check"],
  ["pl", pl, ["1 strona", "2 strony", "5 stron"], "1 sprawdzenie"],
  ["es-ES", es, ["1 página", "2 páginas", "5 páginas"], "1 comprobación"],
  ["ja", ja, ["1 ページ", "2 ページ", "5 ページ"], "1 回の検査"],
] as const)("uses locale plurals in %s", (locale, catalog, expected, singular) => {
  const t = createTranslator({
    locale,
    messages: catalog,
    namespace: "projectSearchInsights.indexing",
  });
  for (const [index, count] of [1, 2, 5].entries())
    expect(t("pageCount", { count })).toBe(expected[index]);
  expect(t("checksToday", { count: 1 })).toContain(singular);
});

it.each([
  ["en", en],
  ["pl", pl],
] as const)("uses the normal locale hour in the %s status", (locale, catalog) => {
  const instant = new Date(2026, 9, 23, 8, 0);
  render(
    <FeatureMessagesProvider locale={locale} timeZone="UTC" messages={{ ...shared, ...catalog }}>
      <IndexingStatus
        data={{
          ...indexingData,
          now: instant,
          report: { ...indexingData.report, oldestResultAt: instant, newestResultAt: instant },
        }}
        projectId="p"
        canInspect
        onInspect={() => undefined}
      />
    </FeatureMessagesProvider>,
  );
  const freshness = screen.getByText(locale === "en" ? /Oldest result/ : /Najstarszy wynik/);
  expect(freshness).toHaveTextContent(locale === "en" ? "8:00 AM" : "08:00");
  if (locale === "en") expect(freshness).not.toHaveTextContent("08:00 AM");
});

it("replaces an empty inspection report and absent dates with a useful empty state", () => {
  render(
    wrapper(
      <IndexingStatus
        data={{
          ...indexingData,
          report: {
            ...indexingData.report,
            checked: 0,
            total: 0,
            oldestResultAt: null,
            newestResultAt: null,
          },
        }}
        projectId="p"
        canInspect
        onInspect={() => undefined}
      />,
    ),
  );
  expect(screen.getByText("No URLs to inspect yet.")).toBeInTheDocument();
  expect(screen.queryByText(/Checked 0 of 0|Oldest result: -|As of: -/)).not.toBeInTheDocument();
});
