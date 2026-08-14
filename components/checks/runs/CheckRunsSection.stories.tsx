import { CheckRunsSection } from "@/components/checks/runs/CheckRunsSection";
import {
  checkRunsFixtureView,
  checkRunsNow,
  checkRunsViewFor,
  staleRunFixture,
} from "@/components/checks/runs/check-runs-fixtures";
import { appPath } from "@/lib/routing/app-path";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "storybook/test";

const callbacks = {
  onFilterChange: fn(),
  onLoadMore: fn(),
  onProviderChange: fn(),
  onRangeChange: fn(),
  onRetryFailed: fn(),
  onRetryStale: fn(),
  onAsOfDateChange: fn(),
  onTriggerChange: fn(),
};

const links = {
  connectProviderHref: appPath("prj_story", "integrations"),
  keywordHref: (keywordPublicId: string) => appPath("prj_story", "rank-tracker", keywordPublicId),
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
    budget: {
      blocked: [{ keywordCount: 4, reason: "budget_exhausted" }],
      forecast: {
        capCents: 5_000,
        capLastsUntil: "2026-08-08",
        next48hCents: 530,
        spentCents: 5_000,
      },
    },
    budgetSettingsHref: appPath("prj_story", "settings#provider-usage"),
    filter: "all",
    now: checkRunsNow,
    provider: "all",
    providerOptions: [
      { label: "DataForSEO", value: "dataforseo" },
      { label: "SerpApi", value: "serpapi" },
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
    budget: { blocked: [], forecast: null },
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

export const StaleWithRetry: Story = {
  args: {
    budget: { blocked: [], forecast: null },
    view: {
      ...checkRunsFixtureView,
      counts: { completed: 1, deferred: 0, failed: 0, running: 0, runs: 1, viaFallback: 0 },
      deferredGroups: [],
      providerHealth: [
        {
          coveredAsFallback: 0,
          direct: 1,
          failed: 0,
          isPrimary: true,
          provider: "dataforseo",
          providerLabel: "DataForSEO",
          rateLimited: 0,
        },
      ],
      rows: [staleRunFixture],
    },
  },
};

export const BudgetWarning: Story = {
  args: {
    budget: {
      blocked: [],
      forecast: {
        capCents: 5_000,
        capLastsUntil: "2026-08-08",
        next48hCents: 300,
        spentCents: 3_900,
      },
    },
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
