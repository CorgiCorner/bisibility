import { MobileNav } from "@/components/shell/MobileNav";
import { mockWorkspaces } from "@/components/shell/workspaces.mock";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Shell/MobileNav",
  component: MobileNav,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof MobileNav>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Open: Story = {
  args: {
    activeProjectId: mockWorkspaces[0].id,
    canCreateWorkspace: true,
    defaultOpen: true,
    projectRef: mockWorkspaces[0].publicId,
    workspaces: mockWorkspaces,
  },
  render: (args) => (
    <div className="min-h-[560px] bg-bg p-4 text-fg">
      <MobileNav {...args} />
    </div>
  ),
};
