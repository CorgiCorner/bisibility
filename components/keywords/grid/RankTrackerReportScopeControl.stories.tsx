import { DateDisplayProvider } from "@/components/dates/DateFormatProvider";
import { ProjectRankTrackerMessages } from "@/components/rank-tracker/ProjectRankTrackerMessages";
import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import type { Meta, StoryObj } from "@storybook/react";
import { RankTrackerReportScopeControl } from "./RankTrackerReportScopeControl";

const meta = {
  title: "Keywords/Report scope",
  component: RankTrackerReportScopeControl,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  decorators: [
    (Story) => (
      <ProjectRankTrackerMessages>
        <DateDisplayProvider>
          <div className="min-h-96 bg-bg p-6 text-fg">
            <Story />
          </div>
        </DateDisplayProvider>
      </ProjectRankTrackerMessages>
    ),
  ],
} satisfies Meta<typeof RankTrackerReportScopeControl>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Latest: Story = {
  args: {
    basePath: "/app/prj_story/rank-tracker",
    query: defaultRankTrackerQueryState,
  },
};
export const HistoricalSnapshot: Story = {
  args: {
    ...Latest.args,
    query: {
      ...defaultRankTrackerQueryState,
      reportScope: {
        view: "general",
        subject: null,
        comparisonDays: 7,
        asOf: "2026-10-14T10:00:00.000Z",
      },
    },
  },
};
