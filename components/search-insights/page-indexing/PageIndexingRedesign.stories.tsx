import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import type { IndexingData, IndexingOverview } from "@/lib/search-index/ui-model";
import messages from "@/messages/core/en/project-search-insights.json";
import shared from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "storybook/test";
import { indexingData } from "./indexing.test-support";
import { PageIndexingTab } from "./PageIndexingTab";

const crawled = "Crawled - currently not indexed";
const discovered = "Discovered - currently not indexed";

const overview: IndexingOverview = {
  drops: [],
  reasons: {
    asOf: "2026-10-16T06:00:00.000Z",
    derived: true,
    rows: [
      { change: { delta: 3, kind: "increased" }, count: 12, coverageState: crawled },
      { change: { delta: 0, kind: "unchanged" }, count: 6, coverageState: discovered },
      {
        change: { delta: 2, kind: "new" },
        count: 2,
        coverageState: "Duplicate without user-selected canonical",
      },
      { change: { delta: 1, kind: "new" }, count: 1, coverageState: "Soft 404" },
    ],
  },
  sources: { keyword_target: 7, manual: 0, sitemap: 462 },
};

const actions = {
  exportAction: async () => ({
    csv: "url,reason\n",
    filename: "not-indexed.csv",
    rows: 0,
    truncated: false,
  }),
  inspectAction: async () => [],
  loadDetailAction: async () => null,
  loadUrlsAction: async () => ({ data: [], meta: { next_cursor: null } }),
};

function data(patch: Partial<IndexingData> & { overview?: IndexingOverview }): IndexingData {
  return { ...indexingData, ...patch, overview: patch.overview ?? overview };
}

const meta = {
  args: {
    ...actions,
    canInspect: true,
    data: data({
      backgroundRun: { nextAt: "2026-10-24T07:00:00.000Z", state: "scheduled" },
    }),
    projectId: "prj_example",
  },
  component: PageIndexingTab,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        messages={{ ...shared, ...messages }}
        timeZone="Europe/Warsaw"
      >
        <div className="min-h-screen bg-bg p-4 text-fg">
          <Story />
        </div>
      </FeatureMessagesProvider>
    ),
  ],
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  title: "Search Console/Page indexing/Progress",
} satisfies Meta<typeof PageIndexingTab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InProgress: Story = {};

export const CheckingOff: Story = {
  args: {
    data: data({
      overview,
      settings: { ...indexingData.settings, budgetMode: "off", inspectionDailyLimit: 0 },
    }),
  },
};

export const Finished: Story = {
  args: {
    data: data({
      overview: {
        ...overview,
        reasons: {
          ...overview.reasons,
          rows: overview.reasons.rows.map((row) => ({
            ...row,
            change: { delta: 0, kind: "unchanged" as const },
          })),
        },
      },
      report: {
        ...indexingData.report,
        checked: indexingData.report.total,
        complete: true,
        estimatedDaysRemaining: 0,
        groups: indexingData.report.groups.map((group) =>
          group.group === "not_checked" ? { ...group, total: 0 } : group,
        ),
        remaining: 0,
      },
    }),
  },
};

export const WithDrops: Story = {
  args: {
    data: data({
      overview: {
        ...overview,
        drops: [
          {
            annotationId: "sig_example",
            at: "2026-10-20T06:00:00.000Z",
            reason: crawled,
            url: "https://example.com/blog/retired-guide",
          },
          {
            annotationId: null,
            at: "2026-10-12T06:00:00.000Z",
            reason: discovered,
            url: "https://example.com/compare/legacy-tool",
          },
        ],
      },
    }),
  },
};

export const AllUrlsExpanded: Story = {
  args: { data: data({}) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("All URLs", { exact: true }));
    await expect(canvas.getByRole("searchbox")).toBeVisible();
  },
};
