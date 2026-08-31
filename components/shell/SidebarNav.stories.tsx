import { SidebarNav } from "@/components/shell/SidebarNav";
import { appPath } from "@/lib/routing/app-path";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";

const meta = {
  title: "Shell/SidebarNav",
  component: SidebarNav,
  decorators: [
    (Story) => (
      <div className="w-[248px] bg-bg-elev p-3.5 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SidebarNav>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Expanded: Story = {
  args: { activeHref: appPath("prj_1", "dashboard"), projectRef: "prj_1" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
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
  args: { activeHref: appPath("prj_1", "dashboard"), collapsed: true, projectRef: "prj_1" },
  decorators: [
    (Story) => (
      <div className="w-[72px] bg-bg-elev p-3 text-fg">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText(/^track$/i)).not.toBeInTheDocument();
    await expect(canvas.queryByText(/^research$/i)).not.toBeInTheDocument();
    await expect(canvas.queryByText(/^connect$/i)).not.toBeInTheDocument();
    await expect(canvas.queryByText("alpha")).not.toBeInTheDocument();
  },
};
