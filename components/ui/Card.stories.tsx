import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "UI/Card",
  component: Card,
  decorators: [
    (Story) => (
      <div className="min-h-[180px] bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Card>;

export default meta;

type Story = StoryObj<typeof meta>;

const sizes = ["sm", "md", "lg"] as const;

export const Default: Story = {
  render: () => (
    <Card className="max-w-sm">
      <SectionTitle>Position trend</SectionTitle>
      <p className="m-0 text-[10px] leading-[1.45] text-fg-muted">
        Avg. Google position · lower is better
      </p>
    </Card>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-start gap-3">
      {sizes.map((size) => (
        <Card key={size} className="w-56" size={size}>
          <SectionTitle size={size}>{size.toUpperCase()} card</SectionTitle>
          <p className="m-0 text-[10px] leading-[1.45] text-fg-muted">Ranked keyword health</p>
        </Card>
      ))}
    </div>
  ),
};
