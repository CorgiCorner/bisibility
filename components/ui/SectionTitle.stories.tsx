import { SectionTitle } from "@/components/ui/SectionTitle";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "UI/SectionTitle",
  component: SectionTitle,
  decorators: [
    (Story) => (
      <div className="bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SectionTitle>;

export default meta;

type Story = StoryObj<typeof meta>;

const sizes = ["sm", "md", "lg"] as const;

export const Default: Story = {
  args: { children: "Data source" },
};

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-baseline gap-4">
      {sizes.map((size) => (
        <SectionTitle key={size} size={size}>
          {size.toUpperCase()} title
        </SectionTitle>
      ))}
    </div>
  ),
};
