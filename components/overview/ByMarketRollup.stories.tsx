import { ByMarketRollup } from "@/components/overview/ByMarketRollup";
import { ProjectDashboardMessages } from "@/components/overview/ProjectDashboardMessages";
import type { OverviewMarketRow } from "@/lib/queries/overview-markets";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "storybook/test";

const rows: OverviewMarketRow[] = [
  {
    deltaPoints: -8,
    languageLabel: "Dutch",
    locationId: "loc_be_nl",
    locationLabel: "Belgium",
    previousPeriod: { end: "2026-08-22", start: "2026-07-26" },
    rangeDays: 28,
    researchAvailable: false,
    targetCount: 24,
    top10Count: 11,
    top10Share: 46,
    trend: [58, 54, 52, 49, 51, 48, 47, 46],
  },
  {
    deltaPoints: 6,
    languageLabel: "French",
    locationId: "loc_be_fr",
    locationLabel: "Belgium",
    previousPeriod: { end: "2026-08-22", start: "2026-07-26" },
    rangeDays: 28,
    researchAvailable: true,
    targetCount: 18,
    top10Count: 10,
    top10Share: 56,
    trend: [60, 58, 61, 59, 57, 56, 55, 56],
  },
  {
    deltaPoints: -3,
    languageLabel: "Spanish",
    locationId: "loc_es_es",
    locationLabel: "Spain",
    previousPeriod: { end: "2026-08-22", start: "2026-07-26" },
    rangeDays: 28,
    researchAvailable: true,
    targetCount: 32,
    top10Count: 21,
    top10Share: 66,
    trend: [52, 54, 57, 58, 61, 63, 65, 66],
  },
];

const meta = {
  component: ByMarketRollup,
  decorators: [
    (Story, context) => (
      <ProjectDashboardMessages>
        <div
          className="min-h-[380px] bg-bg p-6 text-fg"
          data-theme={context.parameters.theme ?? "light"}
        >
          <Story />
        </div>
      </ProjectDashboardMessages>
    ),
  ],
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/app/prj_story/dashboard" },
    },
  },
  title: "Overview/ByMarketRollup",
} satisfies Meta<typeof ByMarketRollup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { device: "all", projectRef: "prj_story", rows },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const menu = within(canvasElement.ownerDocument.body);
    const sortTrigger = canvas.getByRole("button", { name: "Sort markets" });
    const marketTitles = () =>
      canvas
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).getByRole("link").textContent);

    await userEvent.click(sortTrigger);
    await userEvent.click(menu.getByRole("menuitem", { name: "Sort: A-Z" }));
    await expect(marketTitles()).toEqual(["Belgium/ Dutch", "Belgium/ French", "Spain/ Spanish"]);

    const href = "/app/prj_story/rank-tracker?location=loc_be_nl&device=all";
    const router = getRouter();
    router.push.mockClear();

    const row = canvas.getAllByRole("row")[1];
    row.focus();
    await userEvent.keyboard("{Enter}");
    await expect(router.push).toHaveBeenCalledWith(href);

    router.push.mockClear();
    const title = canvas.getByRole("link", { name: "View Belgium / Dutch" });
    await expect(title).toHaveAttribute("href", href);
    await userEvent.click(title);
    await expect(router.push).not.toHaveBeenCalled();

    await userEvent.click(sortTrigger);
    await userEvent.click(menu.getByRole("menuitem", { name: "Sort: Worst first" }));
    await expect(sortTrigger).toHaveTextContent("Sort: Worst first");
    await expect(marketTitles()).toEqual(["Belgium/ Dutch", "Spain/ Spanish", "Belgium/ French"]);
    sortTrigger.blur();
  },
};

export const ThemeDark: Story = {
  args: { device: "all", projectRef: "prj_story", rows },
  name: "theme-dark",
  parameters: { theme: "dark" },
};

export const SingleMarketHidden: Story = {
  args: { device: "desktop", projectRef: "prj_story", rows: rows.slice(0, 1) },
};
