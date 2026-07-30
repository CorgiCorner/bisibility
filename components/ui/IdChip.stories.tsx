import { IdChip } from "@/components/ui/IdChip";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "UI/IdChip",
  component: IdChip,
  decorators: [
    (Story) => (
      <div className="bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof IdChip>;

export default meta;

type Story = StoryObj<typeof meta>;

const sizes = ["sm", "md", "lg"] as const;

export const Project: Story = {
  args: { value: "prj_8fK2Qf9m" },
};

export const Sizes: Story = {
  args: { value: "prj_8fK2Qf9m" },
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      {sizes.map((size) => (
        <IdChip key={size} size={size} value={`prj_${size}_8fK2`} />
      ))}
    </div>
  ),
};
