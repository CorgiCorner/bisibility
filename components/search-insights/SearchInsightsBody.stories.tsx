import { ToastProvider } from "@/components/ui/Toast";
import type { Meta, StoryObj } from "@storybook/react";
import { SearchInsightsBody } from "./SearchInsightsBody";
import { SearchInsightsSignalChips } from "./SearchInsightsSignalChips";
import {
  storyFirstView,
  storyImportState,
  storyLoadRowsAction,
  storySignals,
} from "./search-insights-story-fixtures";

const meta = {
  component: SearchInsightsBody,
  decorators: [
    (Story) => (
      <ToastProvider>
        <div className="min-h-screen bg-bg p-4 text-fg sm:p-6">
          <Story />
        </div>
      </ToastProvider>
    ),
  ],
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  title: "Search Console/Body",
} satisfies Meta<typeof SearchInsightsBody>;

export default meta;
type Story = StoryObj<typeof meta>;

const common = {
  importState: storyImportState,
  loadRowsAction: storyLoadRowsAction,
  period: "28",
  projectId: "prj_story",
  property: "sc-domain:example.com",
  signalChips: <SearchInsightsSignalChips namedQueryCount={1284} signals={storySignals} />,
  view: storyFirstView,
};

export const FirstView: Story = { args: common };

export const SessionsImporting: Story = {
  args: {
    ...common,
    view: {
      ...storyFirstView,
      organicSessions: {
        importState: {
          ...storyImportState,
          createdAt: "2026-08-31T10:00:00.000Z",
          daysDone: 10,
          daysTotal: 60,
          lastSyncStartedAt: "2026-08-31T10:00:00.000Z",
          state: "running",
          updatedAt: "2026-08-31T11:00:00.000Z",
        },
        keyEventsConfigured: null,
        property: "123456789",
        status: "connected",
      },
    },
  },
};

export const EmptyWindow: Story = {
  args: {
    ...common,
    view: {
      ...storyFirstView,
      pages: { rows: [], total: 0 },
      queries: { rows: [], total: 0 },
    },
    signalChips: (
      <SearchInsightsSignalChips namedQueryCount={0} signals={{ bandCount: 0, overlapCount: 0 }} />
    ),
  },
};
