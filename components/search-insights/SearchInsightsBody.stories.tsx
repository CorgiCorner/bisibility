import { ToastProvider } from "@/components/ui";
import type { Meta, StoryObj } from "@storybook/react";
import { SearchInsightsBody } from "./SearchInsightsBody";
import {
  storyFirstView,
  storyImportState,
  storyLoadRowsAction,
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
  parameters: { layout: "fullscreen" },
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
  view: storyFirstView,
};

export const FirstView: Story = { args: common };

export const EmptyWindow: Story = {
  args: {
    ...common,
    view: {
      ...storyFirstView,
      pages: { rows: [], total: 0 },
      queries: { rows: [], total: 0 },
      signals: { bandCount: 0, overlapCount: 0 },
    },
  },
};
