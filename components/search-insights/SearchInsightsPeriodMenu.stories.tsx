import { DateDisplayProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { finalizedWindow } from "@/lib/search-insights/dates";
import messages from "@/messages/core/en/project-search-insights.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "storybook/test";
import { SearchInsightsPeriodMenu } from "./SearchInsightsPeriodMenu";
import { storyContext, storyImportFacts } from "./search-insights-story-fixtures";

const meta = {
  args: {
    onPeriodChange: fn(),
    importFacts: storyContext.importState?.facts,
    period: storyContext.period,
    window: storyContext.window,
  },
  component: SearchInsightsPeriodMenu,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        timeZone="UTC"
        messages={mergeMessageCatalogs(sharedMessages, messages)}
      >
        <DateDisplayProvider>
          <div className="bg-bg p-6 text-fg">
            <Story />
          </div>
        </DateDisplayProvider>
      </FeatureMessagesProvider>
    ),
  ],
  parameters: { nextjs: { appDirectory: true } },
  title: "Search Console/Period menu",
} satisfies Meta<typeof SearchInsightsPeriodMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SevenDays: Story = {
  args: {
    period: { comparison: "previous_period", days: 7, id: "7", label: "7 finalized days" },
    window: finalizedWindow("2026-09-25", 7),
  },
  play: ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole("button", {
      name: "Comparison window: 7 finalized days, Sep 19 - 25",
    });
    const primary = within(trigger).getByText("7 finalized days");
    const secondary = within(trigger).getByText("Sep 19 - 25");
    expect(primary.getBoundingClientRect().left).toBeLessThan(
      secondary.getBoundingClientRect().left,
    );
    expect(primary.getBoundingClientRect().top).toBeLessThanOrEqual(
      secondary.getBoundingClientRect().top,
    );
  },
};

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
