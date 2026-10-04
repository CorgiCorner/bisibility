import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { KeywordDetailStoryThemes } from "@/components/keyword-detail/shared/story-theme-preview";
import { KeywordTrafficCard } from "@/components/keywords/KeywordTrafficCard";
import type { ProviderTrafficSyncResult } from "@/lib/integrations/types";
import type { KeywordTrafficDetail, PageTrafficSnapshotLike } from "@/lib/queries/keyword-traffic";
import messages from "@/messages/core/en/project-rank-tracker-keyword-detail.json";
import type { Meta, StoryObj } from "@storybook/react";

const query = {
  clicks: 186,
  ctr: 0.084,
  date: new Date("2026-06-30T00:00:00.000Z"),
  impressions: 2214,
  position: 3.7,
  provider: "gsc",
  windowDays: 28,
} satisfies NonNullable<KeywordTrafficDetail["query"]>;

const pages = [
  {
    bounceRate: null,
    date: new Date("2026-06-30T00:00:00.000Z"),
    engagementRate: 0.62,
    keyEvents: 14,
    path: "/features/rank-tracking",
    provider: "ga4",
    scrollDepth: null,
    sessions: 892,
    visitDurationSeconds: null,
    visitors: null,
    windowDays: 28,
  },
  {
    bounceRate: 0.38,
    date: new Date("2026-06-30T00:00:00.000Z"),
    engagementRate: null,
    keyEvents: null,
    path: "/features/rank-tracking",
    provider: "plausible",
    scrollDepth: 0.71,
    sessions: 744,
    visitDurationSeconds: 124,
    visitors: 611,
    windowDays: 28,
  },
] satisfies PageTrafficSnapshotLike[];

const meta = {
  title: "Keywords/KeywordTrafficCard",
  component: KeywordTrafficCard,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider locale="en" timeZone="UTC" messages={messages}>
        <KeywordDetailStoryThemes>
          <div className="min-h-[520px] text-fg">
            <Story />
          </div>
        </KeywordDetailStoryThemes>
      </FeatureMessagesProvider>
    ),
  ],
  args: {
    canSync: true,
    syncTrafficAction: async (): Promise<ProviderTrafficSyncResult> => ({
      connections: 1,
      keywordSnapshots: 0,
      pageSnapshots: 1,
      runs: [{ status: "succeeded_with_data" }],
    }),
  },
  parameters: { nextjs: { appDirectory: true }, chromatic: { viewports: [390, 768, 1440] } },
} satisfies Meta<typeof KeywordTrafficCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Both: Story = {
  args: {
    projectRef: "prj_1",
    traffic: { hasAnalyticsConnection: true, hasSearchConsoleConnection: true, pages, query },
    trafficState: "both",
  },
};

export const GscOnly: Story = {
  args: {
    projectRef: "prj_1",
    traffic: { hasAnalyticsConnection: true, hasSearchConsoleConnection: true, pages: [], query },
    trafficState: "gsc_only",
  },
};

export const NotConnected: Story = {
  args: {
    projectRef: "prj_1",
    traffic: {
      hasAnalyticsConnection: true,
      hasSearchConsoleConnection: false,
      pages: [],
      query: null,
    },
    trafficState: "not_connected",
  },
};

export const AwaitingFirstSync: Story = {
  args: {
    projectRef: "prj_1",
    traffic: {
      hasAnalyticsConnection: true,
      hasSearchConsoleConnection: true,
      pages: [],
      query: null,
    },
    trafficState: "awaiting_sync",
  },
};

export const PageAnalyticsOnly: Story = {
  args: {
    projectRef: "prj_1",
    traffic: {
      connectedProviders: ["plausible"],
      hasAnalyticsConnection: true,
      hasSearchConsoleConnection: false,
      pages: [pages[1]],
      query: null,
    },
  },
};
export const ConnectedWithoutData: Story = {
  args: {
    projectRef: "prj_1",
    traffic: {
      connectedProviders: ["plausible", "ga4"],
      pagePaths: ["/features/rank-tracking"],
      hasAnalyticsConnection: true,
      hasSearchConsoleConnection: false,
      pages: [],
      query: null,
    },
    syncTrafficAction: async (): Promise<ProviderTrafficSyncResult> => ({
      connections: 2,
      keywordSnapshots: 0,
      pageSnapshots: 0,
      runs: [{ status: "succeeded_empty" }, { status: "succeeded_empty" }],
    }),
  },
};
export const RateLimited: Story = {
  args: {
    ...PageAnalyticsOnly.args,
    syncTrafficAction: async (): Promise<ProviderTrafficSyncResult> => ({
      connections: 0,
      keywordSnapshots: 0,
      pageSnapshots: 0,
      runs: [{ status: "deferred_rate_limit" }],
    }),
  },
};
export const Pending: Story = {
  args: {
    ...PageAnalyticsOnly.args,
    syncTrafficAction: () => new Promise(() => {}),
  },
};
