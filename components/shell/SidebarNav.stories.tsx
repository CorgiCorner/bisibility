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
    await expect(canvas.getByText("Activity")).toBeVisible();
    await expect(canvas.getByText("Modules")).toBeVisible();
    await expect(canvas.getByText("Project")).toBeVisible();
    const searchConsole = canvas.getByText("Search Console").closest("a");
    if (!searchConsole) {
      throw new Error("Search Console navigation link is missing.");
    }
    await expect(within(searchConsole).getByText("beta")).toBeVisible();
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

    // Each heading swaps its label for the 80px tag, so the collapsed rail keeps its three
    // captions rather than falling back to a bare pad. The two spellings differ by case, which
    // is exactly what an exact-string query distinguishes.
    await expect(canvas.getByText("ACTIVITY")).toBeVisible();
    await expect(canvas.getByText("MODULES")).toBeVisible();
    await expect(canvas.getByText("PROJECT")).toBeVisible();
    await expect(canvas.queryByText("Activity")).not.toBeInTheDocument();
    await expect(canvas.queryByText("Modules")).not.toBeInTheDocument();
    await expect(canvas.queryByText("Project")).not.toBeInTheDocument();

    // A row drops its visible label and its badge, and the aria-label is the only thing left
    // naming it. Without that the whole rail would announce as a column of bare "link".
    await expect(canvas.queryByText("Search Console")).not.toBeInTheDocument();
    await expect(canvas.queryByText("beta")).not.toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Search Console" })).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Settings" })).toBeVisible();
  },
};
