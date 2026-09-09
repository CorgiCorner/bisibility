import { ConsentBanner } from "@/components/analytics/ConsentBanner";
import { AppThemeRoot } from "@/components/shell/AppThemeRoot";
import { CommandPaletteProvider } from "@/components/shell/CommandPalette";
import { Sidebar } from "@/components/shell/Sidebar";
import { mockWorkspaces } from "@/components/shell/workspaces.mock";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "storybook/test";

const saveConsent = fn(async (values: { analytics: boolean; replay: boolean }) => ({
  ...values,
  decidedAt: 1,
  status: "decided" as const,
}));

const meta = {
  args: { saveConsent },
  component: ConsentBanner,
  parameters: { layout: "fullscreen" },
  title: "Analytics/ConsentBanner",
} satisfies Meta<typeof ConsentBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Refuse: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("button", { name: "Reject all" }),
    );
    await expect(saveConsent).toHaveBeenCalledWith({ analytics: false, replay: false });
  },
};

export const ReplayUpdateInDashboard: Story = {
  parameters: { nextjs: { appDirectory: true } },
  args: {
    initialConsent: {
      analytics: true,
      replay: false,
      replayNeedsDecision: true,
      decidedAt: 1,
      status: "decided",
    },
  },
  render: (args) => (
    <AppThemeRoot
      defaultTheme="light"
      className="min-h-dvh bg-bg text-fg lg:grid lg:grid-cols-[270px_minmax(0,1fr)]"
    >
      <ConsentBanner {...args} />
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
        <main className="p-7">
          <h1 className="m-0 text-[21px] font-semibold">Overview</h1>
        </main>
      </CommandPaletteProvider>
    </AppThemeRoot>
  ),
};
