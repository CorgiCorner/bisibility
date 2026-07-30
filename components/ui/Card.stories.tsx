import { Card } from "@/components/ui/Card";
import { MonoText } from "@/components/ui/MonoText";
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
      <MonoText muted>Avg. Google position · lower is better</MonoText>
    </Card>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-start gap-3">
      {sizes.map((size) => (
        <Card key={size} className="w-56" size={size}>
          <SectionTitle size={size}>{size.toUpperCase()} card</SectionTitle>
          <MonoText muted size={size}>
            Ranked keyword health
          </MonoText>
        </Card>
      ))}
    </div>
  ),
};
