import { ToastProvider } from "@/components/ui/Toast";
import type { SyncSearchInsightsNowAction } from "@/lib/actions/search-insights";
import type { Meta, StoryObj } from "@storybook/react";
import { SearchInsightsActions } from "./SearchInsightsActions";
import {
  storyExportAction,
  storyImportState,
  storySyncAction,
} from "./search-insights-story-fixtures";

const unavailableSyncAction = (async () => ({
  status: "unavailable" as const,
})) as SyncSearchInsightsNowAction;

const meta = {
  args: {
    exportAction: storyExportAction,
    hasProperty: true,
    importState: null,
    period: "28",
    projectId: "prj_story",
    queryCount: 1284,
    syncAction: storySyncAction,
  },
  component: SearchInsightsActions,
  decorators: [
    (Story) => (
      <ToastProvider>
        <div className="flex items-center gap-2.5 bg-bg p-6 text-fg">
          <Story />
        </div>
      </ToastProvider>
    ),
  ],
  title: "Search Console/Actions",
} satisfies Meta<typeof SearchInsightsActions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};

export const BackfillRunning: Story = {
  args: { importState: storyImportState, queryCount: 96 },
};

export const SyncUnavailable: Story = {
  args: { syncAction: unavailableSyncAction },
};

export const NothingStoredYet: Story = {
  args: { queryCount: 0 },
};
