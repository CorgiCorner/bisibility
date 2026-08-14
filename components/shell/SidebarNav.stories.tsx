import { SidebarNav } from "@/components/shell/SidebarNav";
import { appPath } from "@/lib/routing/app-path";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Shell/SidebarNav",
  component: SidebarNav,
  decorators: [
    (Story) => (
      <div className="w-[248px] bg-bg-elev p-[14px] text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SidebarNav>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Expanded: Story = {
  args: { activeHref: appPath("prj_1", "dashboard"), projectRef: "prj_1" },
};

export const Collapsed: Story = {
  args: { activeHref: appPath("prj_1", "dashboard"), collapsed: true, projectRef: "prj_1" },
  decorators: [
    (Story) => (
      <div className="w-[72px] bg-bg-elev p-3 text-fg">
        <Story />
      </div>
    ),
  ],
};
