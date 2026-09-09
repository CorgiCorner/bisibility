import { ToastProvider } from "@/components/ui/Toast";
import { finalizedWindow } from "@/lib/search-insights/dates";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "storybook/test";
import type { CancelGooglePropertySelectionAction } from "./SearchInsightsOauthReturn";
import { SearchInsightsWorkspace } from "./SearchInsightsWorkspace";
import {
  storyCompletePropertySelectionAction,
  storyContext,
  storyExportAction,
  storyImportState,
  storyLoadPropertiesAction,
  storyOauth,
  storySelectPropertyAction,
  storySyncAction,
} from "./search-insights-story-fixtures";

const meta = {
  component: SearchInsightsWorkspace,
  decorators: [
    (Story) => (
      <ToastProvider>
        <div className="min-h-screen bg-bg p-4 text-fg sm:p-6">
          <Story />
        </div>
      </ToastProvider>
    ),
  ],
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  title: "Search Console/Workspace",
} satisfies Meta<typeof SearchInsightsWorkspace>;

export default meta;
type Story = StoryObj<typeof meta>;

const cancelPropertySelectionAction = (async () => ({
  status: "cancelled" as const,
})) as CancelGooglePropertySelectionAction;

const common = {
  cancelPropertySelectionAction,
  completePropertySelectionAction: storyCompletePropertySelectionAction,
  context: storyContext,
  disconnectConnectionAction: async () => ({ ok: true }),
  exportAction: storyExportAction,
  loadPropertiesAction: storyLoadPropertiesAction,
  oauth: storyOauth,
  projectDomain: "example.com",
  projectId: "prj_story",
  selectPropertyAction: storySelectPropertyAction,
  syncAction: storySyncAction,
  trustStrip: null,
};

export const Connected: Story = { args: common };

export const BackfillRunning: Story = {
  args: {
    ...common,
    context: { ...storyContext, counts: { queries: 96 }, importState: storyImportState },
  },
};

export const FirstLook: Story = {
  args: {
    ...common,
    context: {
      ...storyContext,
      period: {
        comparison: "previous_period",
        days: 1,
        id: "1",
        label: "1 finalized day",
      },
      window: finalizedWindow("2026-07-08", 1),
    },
  },
};

export const SevenDays: Story = {
  args: {
    ...common,
    context: {
      ...storyContext,
      period: {
        comparison: "previous_period",
        days: 7,
        id: "7",
        label: "7 finalized days",
      },
      window: finalizedWindow("2026-07-08", 7),
    },
  },
};

export const NotConnected: Story = {
  args: {
    ...common,
    context: {
      ...storyContext,
      connection: { property: null, status: "not_connected" },
      counts: { queries: 0 },
      importState: null,
      window: null,
      yoy: { monthsImported: 0, required: 13 },
    },
  },
};

export const WithTrustStrip: Story = {
  args: {
    ...common,
    trustStrip: (
      <p className="bg-bg-sunken px-4 py-3 font-sans tabular-nums text-ui-caption text-fg-muted">
        Google data available through Jul 8, 2026
      </p>
    ),
  },
};

export const PropertyMenuOpen: Story = {
  args: common,
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Search Console property" }),
    );
  },
};

export const PeriodChanging: Story = {
  args: {
    ...common,
    children: <p>Current metrics and tables</p>,
    trustStrip: <p>Current coverage</p>,
  },
  beforeEach: () => {
    const router = getRouter();
    router.replace.mockImplementation(() => new Promise<void>(() => {}));
    return () => router.replace.mockReset();
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /^Comparison window:/ }));
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("option", { name: /90 finalized days/ }),
    );
    await expect(canvas.getByRole("region", { name: "Search Console data loading" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: /^Comparison window:/ })).toBeDisabled();
  },
};
