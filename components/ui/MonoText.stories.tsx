import { MonoText } from "@/components/ui/MonoText";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "UI/MonoText",
  component: MonoText,
  decorators: [
    (Story) => (
      <div className="bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MonoText>;

export default meta;

type Story = StoryObj<typeof meta>;

const sizes = ["sm", "md", "lg"] as const;

export const Default: Story = {
  args: { children: "prj_8fK2Qf9m" },
};

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-baseline gap-4">
      {sizes.map((size) => (
        <MonoText key={size} size={size}>
          {size}_rank_check
        </MonoText>
      ))}
    </div>
  ),
};
