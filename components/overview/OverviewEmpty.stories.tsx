import { OverviewEmpty } from "@/components/overview/OverviewEmpty";
import { overviewFixture } from "@/components/overview/overview-fixtures";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Overview/OverviewEmpty",
  component: OverviewEmpty,
  decorators: [
    (Story) => (
      <div className="min-h-[300px] bg-bg p-6 text-fg">
        <div className="max-w-4xl">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof OverviewEmpty>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    capabilities: {
      canCreateKeywords: true,
      canInstallSampleData: true,
      canManageImports: true,
      canManageProviders: true,
    },
    gettingStarted: overviewFixture.gettingStarted,
    workspaceName: "Vega Labs",
  },
};
