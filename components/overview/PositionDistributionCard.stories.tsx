import { overviewFixture } from "@/components/overview/overview-fixtures";
import { PositionDistributionCard } from "@/components/overview/PositionDistributionCard";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Overview/PositionDistributionCard",
  component: PositionDistributionCard,
  decorators: [
    (Story) => (
      <div className="min-h-[320px] bg-bg p-6 text-fg">
        <div className="max-w-md">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof PositionDistributionCard>;

export default meta;

type Story = StoryObj<typeof meta>;

const emptyBuckets = overviewFixture.distribution.map((bucket) => ({ ...bucket, count: 0 }));

export const Default: Story = {
  args: { buckets: overviewFixture.distribution },
};

export const Empty: Story = {
  args: { buckets: emptyBuckets, empty: true },
};

export const ZeroHeavy: Story = {
  args: {
    buckets: overviewFixture.distribution.map((bucket, index) => ({
      ...bucket,
      count: index === 0 ? 1 : 0,
    })),
  },
};
