import { SidebarFooter } from "@/components/shell/SidebarFooter";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Shell/SidebarFooter",
  component: SidebarFooter,
  decorators: [
    (Story) => (
      <div className="flex h-[220px] w-[248px] flex-col bg-bg-elev p-3.5 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SidebarFooter>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Expanded: Story = {};

export const Collapsed: Story = {
  args: { collapsed: true },
  decorators: [
    (Story) => (
      <div className="flex h-[220px] w-[72px] flex-col bg-bg-elev p-3 text-fg">
        <Story />
      </div>
    ),
  ],
};
