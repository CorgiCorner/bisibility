import { Pill } from "@/components/ui/Pill";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "UI/Pill",
  component: Pill,
  decorators: [
    (Story) => (
      <div className="flex gap-2 bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Pill>;

export default meta;

type Story = StoryObj<typeof meta>;

const sizes = ["sm", "md", "lg"] as const;

export const Default: Story = {
  render: () => (
    <>
      <Pill active>Top 10</Pill>
      <Pill>Dropped</Pill>
      <Pill>No data</Pill>
    </>
  ),
};

export const Sizes: Story = {
  render: () => (
    <>
      {sizes.map((size) => (
        <Pill key={size} active size={size}>
          {size.toUpperCase()}
        </Pill>
      ))}
    </>
  ),
};
