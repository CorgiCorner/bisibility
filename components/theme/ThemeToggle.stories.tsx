import { ThemeToggle } from "@/components/theme/ThemeToggle";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Theme/ThemeToggle",
  component: ThemeToggle,
  decorators: [
    (Story) => (
      <div className="min-h-[120px] bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ThemeToggle>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
