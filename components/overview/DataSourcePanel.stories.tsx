import {
  checkHealthFixture,
  exhaustedCheckHealthFixture,
} from "@/components/overview/check-health-fixtures";
import { DataSourcePanel } from "@/components/overview/DataSourcePanel";
import { overviewFixture } from "@/components/overview/overview-fixtures";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Overview/DataSourcePanel",
  component: DataSourcePanel,
  decorators: [
    (Story) => (
      <div className="min-h-[300px] bg-bg p-6 text-fg">
        <div className="max-w-4xl">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof DataSourcePanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { checkHealth: checkHealthFixture, health: overviewFixture.dataSource },
};

export const BudgetReached: Story = {
  args: { checkHealth: exhaustedCheckHealthFixture, health: overviewFixture.dataSource },
};
