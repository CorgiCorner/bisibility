import { AppThemeRoot } from "@/components/shell/AppThemeRoot";
import { CommandPaletteProvider } from "@/components/shell/CommandPalette";
import { Sidebar } from "@/components/shell/Sidebar";
import { mockWorkspaces } from "@/components/shell/workspaces.mock";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";

function Frame({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <AppThemeRoot
      data-collapsed={collapsed ? "true" : "false"}
      data-shell-root
      defaultTheme="light"
      className="min-h-[620px] bg-bg text-fg lg:grid lg:grid-cols-[270px_minmax(0,1fr)] data-[collapsed=true]:lg:grid-cols-[80px_minmax(0,1fr)]"
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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("sidebar-collapse-icon")).toBeInTheDocument();
    await expect(canvas.getByText(/^track$/i)).toBeVisible();
    await expect(canvas.getByText(/^research$/i)).toBeVisible();
    await expect(canvas.getByText(/^connect$/i)).toBeVisible();
    const searchConsole = canvas.getByText("Search Console").closest("a");
    if (!searchConsole) {
      throw new Error("Search Console navigation link is missing.");
    }
    await expect(within(searchConsole).getByText("alpha")).toBeVisible();
  },
};

export const Collapsed: Story = {
  name: "Collapsed - project mark expands sidebar",
  render: () => <Frame collapsed />,
};

export const CollapsedHovered: Story = {
  name: "Collapsed - project mark",
  render: () => <Frame collapsed />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "Expand sidebar" });
    await expect(
      trigger.querySelector("[data-testid=workspace-tile-favicon-probe]"),
    ).toBeInTheDocument();
  },
};
