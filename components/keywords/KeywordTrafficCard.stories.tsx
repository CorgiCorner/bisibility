import { KeywordTrafficCard } from "@/components/keywords/KeywordTrafficCard";
import type { KeywordTrafficDetail, PageTrafficSnapshotLike } from "@/lib/queries/keyword-traffic";
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
      <div className="min-h-[520px] bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof KeywordTrafficCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const FullData: Story = {
  args: { projectRef: "prj_1", traffic: { hasAnalyticsConnection: true, pages, query } },
};

export const QueryOnly: Story = {
  args: { projectRef: "prj_1", traffic: { hasAnalyticsConnection: true, pages: [], query } },
};

export const PagesOnly: Story = {
  args: { projectRef: "prj_1", traffic: { hasAnalyticsConnection: true, pages, query: null } },
};

export const NotConnected: Story = {
  args: {
    projectRef: "prj_1",
    traffic: { hasAnalyticsConnection: false, pages: [], query: null },
  },
};

export const AwaitingFirstSync: Story = {
  args: {
    projectRef: "prj_1",
    traffic: { hasAnalyticsConnection: true, pages: [], query: null },
  },
};
