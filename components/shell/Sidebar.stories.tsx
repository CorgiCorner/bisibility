import { AppThemeRoot } from "@/components/shell/AppThemeRoot";
import { CommandPaletteProvider } from "@/components/shell/CommandPalette";
import { Sidebar } from "@/components/shell/Sidebar";
import { mockWorkspaces } from "@/components/shell/workspaces.mock";
import type { Meta, StoryObj } from "@storybook/react";

function Frame({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <AppThemeRoot
      data-collapsed={collapsed ? "true" : "false"}
      data-shell-root
      defaultTheme="light"
      className="min-h-[620px] bg-bg text-fg lg:grid lg:grid-cols-[248px_minmax(0,1fr)] data-[collapsed=true]:lg:grid-cols-[72px_minmax(0,1fr)]"
    >
      <CommandPaletteProvider
        projectId={mockWorkspaces[0].id}
        projectRef={mockWorkspaces[0].publicId}
      >
        <Sidebar
          activeProjectId={mockWorkspaces[0].id}
          canCreateWorkspace
          projectRef={mockWorkspaces[0].publicId}
          workspaces={mockWorkspaces}
        />
        <div className="border-l border-border p-7">
          <h1 className="m-0 text-[21px] font-semibold">Overview</h1>
        </div>
      </CommandPaletteProvider>
    </AppThemeRoot>
  );
}

const meta = {
  title: "Shell/Sidebar",
  component: Sidebar,
  args: {
    activeProjectId: mockWorkspaces[0].id,
    canCreateWorkspace: true,
    projectRef: mockWorkspaces[0].publicId,
    workspaces: mockWorkspaces,
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Sidebar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Expanded: Story = {
  render: () => <Frame />,
};

export const Collapsed: Story = {
  render: () => <Frame collapsed />,
};
