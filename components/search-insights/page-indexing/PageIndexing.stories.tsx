import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import type { LoadUrlsAction } from "@/lib/search-index/ui-model";
import messages from "@/messages/core/en/project-search-insights.json";
import shared from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import type { ComponentProps } from "react";
import { userEvent, within } from "storybook/test";
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
  longDays,
  pausedDays,
  singleSnapshot,
  siteFillingDays,
  snapshot,
  steadyDays,
  thirdDays,
} from "./history-fixtures";
import { historyTab } from "./history-tab-fixtures";
import { IndexingDrawer } from "./IndexingDrawer";
import { IndexingOverview } from "./IndexingOverview";
import { IndexingSitemaps } from "./IndexingSitemaps";
import { IndexingTrend, IndexingTrendTooltip } from "./IndexingTrend";
import { IndexingUrls } from "./IndexingUrls";
import { indexingData, indexingUrl } from "./indexing.test-support";
import { PageIndexingTab } from "./PageIndexingTab";
import { SearchConsoleTabs } from "./SearchConsoleTabs";
import { useIndexingUrls } from "./use-indexing-urls";

const meta = {
  title: "Search Console/Page indexing/Tab",
  component: PageIndexingTab,
  args: {
    data: indexingData,
    projectId: "prj_example",
    canInspect: true,
    inspectAction: async ({ urls }) => urls.map((url) => ({ url, status: "success" as const })),
    loadDetailAction: async () => indexingUrl,
    loadUrlsAction: async () => ({ data: [indexingUrl], meta: { next_cursor: null } }),
  },
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        timeZone="Europe/Warsaw"
        messages={{ ...shared, ...messages }}
      >
        <div className="min-h-screen bg-bg p-4 text-fg">
          <div className="flex min-w-0 flex-col gap-3">
            <Story />
          </div>
        </div>
      </FeatureMessagesProvider>
    ),
  ],
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
} satisfies Meta<typeof PageIndexingTab>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const NoConnection: Story = { args: { data: null } };
export const NoSitemaps: Story = { args: { data: { ...indexingData, sitemaps: [] } } };
export const NothingInspected: Story = {
  render: (args) => <HistoryTabStory {...args} />,
  args: {
    loadUrlsAction: async () => ({ data: [], meta: { next_cursor: null } }),
    data: {
      ...indexingData,
      urls: [],
      sitemapSnapshot: { readAt: null, lastError: null, lastErrorAt: null, rows: [] },
      backgroundRun: { state: "unavailable", nextAt: null },
      report: {
        ...indexingData.report,
        checked: 0,
        total: 0,
        oldestResultAt: null,
        newestResultAt: null,
        groups: indexingData.report.groups.map((group) => ({ ...group, total: 0, reasons: [] })),
      },
    },
  },
};
export const DailyQuotaExhausted: Story = {
  args: { data: { ...indexingData, settings: { ...indexingData.settings, todayCount: 2000 } } },
};
export const Drawer: Story = {
  render: () => <IndexingDrawer detail={indexingUrl} onClose={() => undefined} />,
};
export const OverviewSection: Story = {
  render: () => (
    <IndexingOverview report={steadyTab.report} days={steadyTab.days} onSelect={() => undefined} />
  ),
};
export const Sections: Story = {
  render: () => (
    <>
      <IndexingSitemaps rows={indexingData.sitemaps} />
      <IndexingOverview
        report={indexingData.report}
        days={indexingData.days}
        onSelect={() => undefined}
      />
    </>
  ),
};
function UrlsStory({
  action,
  empty = false,
  data = indexingData,
}: {
  action: LoadUrlsAction;
  empty?: boolean;
  data?: typeof indexingData;
}) {
  const list = useIndexingUrls(empty ? { ...data, urls: [] } : data, "prj_example", action);
  return <IndexingUrls data={data} list={list} onOpen={() => undefined} />;
}
export const Urls: Story = {
  render: (args) => <UrlsStory action={args.loadUrlsAction} />,
};
export const ProjectAllowanceUsed: Story = {
  name: "Project allowance used",
  args: { data: { ...indexingData, allowance: { limit: 50, used: 50, remaining: 0 } } },
};
export const UnknownEnum: Story = {
  render: () => (
    <IndexingDrawer
      detail={{ ...indexingUrl, verdict: "FUTURE_VERDICT" }}
      onClose={() => undefined}
    />
  ),
};
export const SingularCounts: Story = {
  args: { data: { ...indexingData, settings: { ...indexingData.settings, todayCount: 1 } } },
};
export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div className="mx-auto w-[375px] max-w-full">
        <Story />
      </div>
    ),
  ],
};

export const TrendNoHistory: Story = { render: () => <IndexingTrend days={[]} /> };
export const TrendFirstDay: Story = {
  render: () => <IndexingTrend days={firstDays} complete={false} />,
};
export const TrendThirdDay: Story = {
  render: () => <IndexingTrend days={thirdDays} complete={false} />,
};
export const TrendFillingLargeSitemap: Story = {
  render: () => <IndexingTrend days={fillingDays} complete={false} />,
};
export const TrendSteady90Days: Story = { render: () => <IndexingTrend days={steadyDays} /> };
export const TrendPausedDays: Story = { render: () => <IndexingTrend days={pausedDays} /> };
export const TrendMoreThan90Days: Story = { render: () => <IndexingTrend days={longDays} /> };

export const SitemapsIndexWithChildren: Story = {
  render: () => <IndexingSitemaps snapshot={snapshot} />,
};
export const SitemapsSingle: Story = {
  render: () => <IndexingSitemaps snapshot={singleSnapshot} />,
};
export const SitemapsWithErrors: Story = {
  render: () => (
    <IndexingSitemaps
      snapshot={{
        ...singleSnapshot,
        rows: singleSnapshot.rows.map((row) => ({ ...row, errors: 2, warnings: 5 })),
      }}
    />
  ),
};
export const SitemapsNoLongerSubmitted: Story = {
  render: () => (
    <IndexingSitemaps
      snapshot={{
        ...singleSnapshot,
        rows: singleSnapshot.rows.map((row) => ({ ...row, noLongerSubmitted: true })),
      }}
    />
  ),
};
export const SitemapsNotReadYet: Story = {
  render: () => (
    <IndexingSitemaps snapshot={{ readAt: null, lastError: null, lastErrorAt: null, rows: [] }} />
  ),
};
export const SitemapsReadFailed: Story = {
  render: () => (
    <IndexingSitemaps
      snapshot={{ ...snapshot, lastError: "permission", lastErrorAt: "2026-10-24T06:00:00Z" }}
    />
  ),
};
export const SitemapsNoneSubmitted: Story = {
  render: () => <IndexingSitemaps snapshot={{ ...snapshot, rows: [] }} />,
};

export const DrawerFirstInspectedToday: Story = {
  render: () => <IndexingDrawer detail={drawerToday} onClose={() => undefined} />,
};
export const DrawerSteadyIndexed: Story = {
  render: () => <IndexingDrawer detail={drawerSteady} onClose={() => undefined} />,
};
export const DrawerDroppedOut: Story = {
  render: () => <IndexingDrawer detail={drawerDropped} onClose={() => undefined} />,
};
export const DrawerFlapping: Story = {
  render: () => <IndexingDrawer detail={drawerFlapping} onClose={() => undefined} />,
};
export const DrawerLastInspectionFailed: Story = {
  render: () => <IndexingDrawer detail={drawerFailed} onClose={() => undefined} />,
};
export const DrawerManualOnly: Story = {
  render: () => <IndexingDrawer detail={drawerManual} onClose={() => undefined} />,
};

const firstTab = historyTab(firstDays);
const fillingTab = historyTab(siteFillingDays);
const steadyTab = historyTab(steadyDays);
const offDays = pausedDays.map((day, index) =>
  index >= 25
    ? { ...pausedDays[24], date: day.date, stop: "off" as const, inspectedThatDay: 0 }
    : day,
);
const pausedTab = historyTab(offDays, "off");
const quotaDays = steadyDays.map((day, index) =>
  index === 89 ? { ...day, stop: "quota" as const, inspectedThatDay: 50 } : day,
);
const quotaTab = historyTab(quotaDays);
export const TabFirstDay: Story = {
  args: { data: firstTab },
  render: (args) => <HistoryTabStory {...args} />,
};
export const TabFillingLargeSitemap: Story = {
  args: { data: fillingTab },
  render: (args) => <HistoryTabStory {...args} />,
};
export const TabSteady: Story = {
  args: { data: steadyTab },
  render: (args) => <HistoryTabStory {...args} />,
};
export const TabPaused: Story = {
  args: { data: pausedTab },
  render: (args) => <HistoryTabStory {...args} />,
};
export const TabQuotaExhaustedWithHistory: Story = {
  args: { data: quotaTab },
  render: (args) => <HistoryTabStory {...args} />,
};
export const TabSteadyNarrow: Story = {
  ...TabSteady,
  decorators: [
    (Story) => (
      <div className="mx-auto w-[375px] max-w-full">
        <Story />
      </div>
    ),
  ],
};
export const TabFirstDayNarrow: Story = {
  ...TabFirstDay,
  decorators: [
    (Story) => (
      <div className="mx-auto w-[375px] max-w-full">
        <Story />
      </div>
    ),
  ],
};

function HistoryTabStory(args: ComponentProps<typeof PageIndexingTab>) {
  const data = args.data;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <SearchConsoleTabs
        active="page-indexing"
        base="/app/prj_example/search-console"
        query=""
        notIndexed={
          data?.report.groups.find((group) => group.group === "not_indexed")?.total ?? null
        }
      />
      <PageIndexingTab
        {...args}
        loadUrlsAction={async ({ query }) => ({
          data: (data?.urls ?? []).filter(
            (row) =>
              (!query.group || row.group === query.group) &&
              (!query.coverage_state || row.coverageState === query.coverage_state) &&
              (!query.sitemap || row.sitemapUrl === query.sitemap) &&
              (!query.search || row.url.toLowerCase().includes(query.search.toLowerCase())) &&
              (!query.changed_since ||
                row.history?.changes.some(
                  (change) =>
                    Object.keys(change.previous ?? {}).length > 0 &&
                    new Date(change.at) >= new Date(query.changed_since ?? ""),
                )),
          ),
          meta: { next_cursor: null },
        })}
        loadDetailAction={async ({ url }) => {
          const row = data?.urls.find((row) => row.url === url);
          if (!row) return null;
          return {
            ...row,
            historyThrough: data?.days?.at(-1)?.date,
            history: row.history,
          };
        }}
      />
    </div>
  );
}

export const UrlsWithChanges: Story = {
  args: { data: steadyTab },
  render: (args) => <HistoryTabStory {...args} />,
};
export const UrlsChangedLast7Days: Story = {
  ...UrlsWithChanges,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Change" }));
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("menuitem", {
        name: "Changed in the last 7 days",
      }),
    );
  },
};
export const TrendChangesTooltip: Story = {
  render: () => (
    <IndexingTrendTooltip
      day={steadyDays.find((day) => day.date === "2026-10-20") ?? steadyDays[0]}
    />
  ),
};

export const UrlsWithoutMatches: Story = {
  render: (args) => <UrlsStory action={args.loadUrlsAction} empty />,
};

const paginatedRows = Array.from({ length: 150 }, (_, i) => ({
  ...indexingUrl,
  url: `https://example.com/posts/${String(i).padStart(3, "0")}-${i % 3 ? "guide" : "a-long-guide-to-search-visibility-and-indexing"}`,
}));
export const UrlsPaginated: Story = {
  render: () => (
    <UrlsStory
      data={{ ...indexingData, urls: paginatedRows.slice(0, 50), totalUrls: 150 }}
      action={async ({ query }) => ({
        data: (query.sort_direction === "desc"
          ? [...paginatedRows].reverse()
          : paginatedRows
        ).slice(
          ((query.page ?? 1) - 1) * (query.limit ?? 50),
          (query.page ?? 1) * (query.limit ?? 50),
        ),
        meta: { next_cursor: null, total: 150, page: query.page ?? 1 },
      })}
    />
  ),
};
