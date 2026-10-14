import { ProjectDashboardMessages } from "@/components/overview/ProjectDashboardMessages";
import type { Meta, StoryObj } from "@storybook/react";
import { LocalReportCard } from "./LocalReportCard";
import { localStoryReport } from "./test-fixtures";

const meta = {
  title: "Dashboard/Local business report",
  component: LocalReportCard,
  args: { report: localStoryReport },
  decorators: [
    (Story) => (
      <ProjectDashboardMessages>
        <div className="max-w-4xl p-4">
          <Story />
        </div>
      </ProjectDashboardMessages>
    ),
  ],
} satisfies Meta<typeof LocalReportCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const QualifiedScope: Story = {};
export const UnknownCurrentDefinition: Story = {
  args: {
    report: {
      ...localStoryReport,
      presence: null,
      targetTop3: null,
      conditionalTop3: null,
      averageFoundSlot: null,
      averageFoundCount: 0,
      matchCoverage: null,
      observedCoverage: 0,
      freshness: "unknown",
      counts: {
        ...localStoryReport.counts,
        measured: 0,
        metricEligible: 0,
        ranked: 0,
        knownAbsent: 0,
        unknown: 10,
        freshDeterminate: null,
        unknownFreshness: 10,
      },
    },
  },
};
export const NarrowViewport: Story = { parameters: { viewport: { defaultViewport: "mobile1" } } };
