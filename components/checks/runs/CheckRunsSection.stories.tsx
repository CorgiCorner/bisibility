import { CheckRunsSection } from "@/components/checks/runs/CheckRunsSection";
import {
  checkRunsFixtureView,
  checkRunsNow,
  checkRunsViewFor,
} from "@/components/checks/runs/check-runs-fixtures";
import { appPath } from "@/lib/routing/app-path";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";

const callbacks = {
  onFilterChange: fn(),
  onLoadMore: fn(),
  onProviderChange: fn(),
  onRangeChange: fn(),
  onAsOfDateChange: fn(),
  onTriggerChange: fn(),
};

const links = {
  connectProviderHref: appPath("prj_story", "integrations"),
  keywordHref: (keywordPublicId: string) => appPath("prj_story", "keywords", keywordPublicId),
  reorderProvidersHref: appPath("prj_story", "integrations"),
  reviewProvidersHref: appPath("prj_story", "integrations"),
  timelineHref: appPath("prj_story", "activity"),
};

const meta = {
  title: "Checks/Runs/CheckRunsSection",
  component: CheckRunsSection,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-bg p-4 text-fg sm:p-8">
        <div className="mx-auto max-w-[1080px]">
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    ...callbacks,
    ...links,
    asOfDate: "2026-07-24",
    filter: "all",
    now: checkRunsNow,
    provider: "all",
    providerOptions: [
      { label: "DataForSEO", value: "dataforseo" },
      { label: "SerpAPI", value: "serpapi" },
    ],
    range: "24h",
    timeZone: "UTC",
    trigger: "all",
    view: checkRunsFixtureView,
  },
} satisfies Meta<typeof CheckRunsSection>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const FailedWithChainExpanded: Story = {
  args: {
    filter: "failed",
    initialExpandedRunIds: ["run_failed"],
    view: checkRunsViewFor("failed"),
  },
};

export const FallbackCountryLevel: Story = {
  args: {
    filter: "fallback",
    initialExpandedRunIds: ["run_fallback"],
    view: checkRunsViewFor("fallback"),
  },
};

export const AsOfDatePopoverOpen: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "As of: Jul 24, 2026" }),
    );
    await expect(
      within(canvasElement.ownerDocument.body).getByRole("dialog", { name: "As of date" }),
    ).toBeVisible();
  },
};

export const Running: Story = {
  args: {
    filter: "running",
    view: checkRunsViewFor("running"),
  },
};

export const SkippedView: Story = {
  args: {
    filter: "deferred",
    range: "7d",
    view: checkRunsViewFor("deferred"),
  },
};

export const NarrowContainer: Story = {
  args: {
    initialExpandedRunIds: ["run_completed"],
  },
  decorators: [
    (Story) => (
      <div className="w-[520px] max-w-full">
        <Story />
      </div>
    ),
  ],
};
