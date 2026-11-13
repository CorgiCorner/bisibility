import { DateDisplayProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import type { ExistingVsNewView } from "@/lib/pages/snapshot-view";
import { defaultProjectPagesQuery } from "@/lib/pages/url-state";
import pagesMessages from "@/messages/core/en/project-pages.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";
import { PagesExistingPanel } from "./PagesExistingPanel";

const messages = mergeMessageCatalogs(sharedMessages, pagesMessages);

const comparison: ExistingVsNewView = {
  markers: [],
  metrics: [
    { disabledReason: null, id: "clicks", provider: null },
    { disabledReason: "not_connected", id: "sessions", provider: null },
    { disabledReason: "no_data", id: "conversions", provider: null },
    { disabledReason: null, id: "ai_cites", provider: null },
  ],
  points: [
    { day: "2026-10-01", existing: 20, fresh: 0, removed: 0 },
    { day: "2026-10-02", existing: 24, fresh: 3, removed: 1 },
  ],
  selected: "clicks",
  sessionsNote: null,
  summary: {
    existingPages: 4,
    existingValue: 24,
    freshPages: 1,
    freshValue: 3,
    removedPages: 1,
    removedValue: 1,
    snapshotPages: 5,
  },
  tags: [
    {
      existingPages: 4,
      existingValue: 20,
      freshPages: 1,
      freshValue: 3,
      name: "Docs",
      share: 13,
      tagId: "tag_docs",
    },
  ],
  window: { from: "2026-10-01", to: "2026-10-02" },
};

const meta = {
  component: PagesExistingPanel,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider locale="en" messages={messages} timeZone="UTC">
        <DateDisplayProvider>
          <TooltipProvider>
            <div className="bg-bg p-4 text-fg">
              <Story />
            </div>
          </TooltipProvider>
        </DateDisplayProvider>
      </FeatureMessagesProvider>
    ),
  ],
  parameters: { nextjs: { appDirectory: true } },
  title: "Pages/Existing vs new",
} satisfies Meta<typeof PagesExistingPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const actions = {
  onQuery: fn(),
  onTaken: fn(),
  take: fn(async () => ({
    replaced: false,
    snapshot: {
      id: "snapshot_story",
      label: "Day 1",
      pageCount: 5,
      signalPublicId: null,
      source: "sitemap" as const,
      takenOn: "2026-10-01",
    },
    status: "taken" as const,
  })),
};

export const WithData: Story = {
  args: {
    ...actions,
    canWrite: true,
    comparison,
    projectId: "prj_story",
    query: { ...defaultProjectPagesQuery, tab: "existing-vs-new" },
    snapshot: {
      id: "snapshot_story",
      label: "Day 1",
      pageCount: 5,
      signalPublicId: null,
      source: "sitemap",
      takenOn: "2026-10-01",
    },
    tags: [{ id: "tag_docs", keywordCount: 2, name: "Docs" }],
  },
};

export const Empty: Story = {
  args: {
    ...actions,
    canWrite: true,
    comparison: { ...comparison, points: [], selected: null, tags: [] },
    projectId: "prj_story",
    query: { ...defaultProjectPagesQuery, tab: "existing-vs-new" },
    snapshot: null,
    tags: [],
  },
};
