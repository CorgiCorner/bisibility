import { finalizedWindow } from "@/lib/search-insights/dates";
import type { Meta, StoryObj } from "@storybook/react";
import { userEvent, within } from "storybook/test";
import { SearchInsightsPeriodMenu } from "./SearchInsightsPeriodMenu";
import { storyContext, storyImportFacts } from "./search-insights-story-fixtures";

const meta = {
  args: {
    importFacts: storyContext.importState?.facts,
    period: storyContext.period,
    window: storyContext.window,
  },
  component: SearchInsightsPeriodMenu,
  decorators: [
    (Story) => (
      <div className="bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
  parameters: { nextjs: { appDirectory: true } },
  title: "Search Console/Period menu",
} satisfies Meta<typeof SearchInsightsPeriodMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TwentyEightDays: Story = {};

export const NinetyDays: Story = {
  args: {
    period: {
      comparison: "previous_period",
      days: 90,
      id: "90",
      label: "90 finalized days",
    },
    window: finalizedWindow("2026-07-08", 90),
  },
};

export const FirstLook: Story = {
  args: {
    period: {
      comparison: "previous_period",
      days: 1,
      id: "1",
      label: "1 finalized day",
    },
    window: finalizedWindow("2026-07-08", 1),
  },
};

export const MenuOpen: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: /^Comparison window:/ }),
    );
  },
};

export const FirstLookMenuOpen: Story = {
  args: {
    ...FirstLook.args,
    importFacts: {
      ...storyImportFacts,
      consecutiveDays: 2,
      qualifyingDays: 2,
      readyThrough: {
        d1: { current: true, previous: true },
        d7: { current: false, previous: false },
        d28: { current: false, previous: false },
        d90: { current: false, previous: false },
      },
      stall: {
        ...storyImportFacts.stall,
        expectedDayMs: 300_000,
      },
    },
  },
  play: MenuOpen.play,
};
