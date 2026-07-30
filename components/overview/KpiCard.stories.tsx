import { KpiCard } from "@/components/overview/KpiCard";
import { overviewFixture } from "@/components/overview/overview-fixtures";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Overview/KpiCard",
  component: KpiCard,
  decorators: [
    (Story) => (
      <div className="min-h-[180px] bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof KpiCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const AvgPosition: Story = {
  args: overviewFixture.kpis[0],
};

export const Row: Story = {
  args: overviewFixture.kpis[0],
  render: () => (
    <div className="grid max-w-5xl grid-cols-2 gap-4 lg:grid-cols-4">
      {overviewFixture.kpis.map((kpi) => (
        <KpiCard {...kpi} key={kpi.label} />
      ))}
    </div>
  ),
};
