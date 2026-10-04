import { DateDisplayProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { RetrievedResultsCard } from "@/components/keywords/RetrievedResultsCard";
import type { RetrievedResults, StoredResultsIndexEntry } from "@/lib/checks/contract";
import type { SnapshotExtensionReason } from "@/lib/serp/snapshot-extension";
import messages from "@/messages/core/en/project-rank-tracker-keyword-detail.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";

const now = new Date().toISOString();
function data(
  reason: SnapshotExtensionReason,
  added = false,
): Extract<RetrievedResults, { tier: "full" }> {
  return {
    tier: "full",
    checkId: "check_recent",
    checkedAt: now,
    provider: "serpapi",
    providerLabel: "SerpApi",
    requestedDepth: 10,
    retrievedPositions: 10,
    trackedPosition: null,
    stoppedAtResult: false,
    features: [],
    aiOverview: null,
    fullDetailUntil: null,
    rows: Array.from({ length: 10 }, (_, i) => ({
      position: i + 1,
      domain: `site${i}.example.org`,
      url: `https://site${i}.example.org/guide`,
      title: `Search result ${i + 1}`,
      tracked: false,
    })),
    extension: {
      reason,
      expiresAt: new Date(Date.now() + 900000).toISOString(),
      nextStart: added ? 20 : 10,
      pages: added
        ? [
            {
              start: 10,
              fetchedAt: new Date(Date.now() + 60000).toISOString(),
              skippedDuplicates: 2,
              rows: Array.from({ length: 8 }, (_, i) => ({
                position: i + 13,
                domain: `site${i + 13}.example.org`,
                url: `https://site${i + 13}.example.org/guide`,
                title: `Additional search result ${i + 13}`,
                tracked: false,
              })),
            },
          ]
        : [],
    },
  };
}
const entry: StoredResultsIndexEntry = {
  tier: "full",
  checkId: "check_recent",
  checkedAt: now,
  provider: "serpapi",
  providerLabel: "SerpApi",
  position: null,
  requestedDepth: 10,
  retrievedPositions: 10,
  fullDetailUntil: null,
  stoppedAtResult: false,
  degradedToCountry: false,
};
const meta = {
  title: "Keywords/SnapshotExtension",
  component: RetrievedResultsCard,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        timeZone="UTC"
        messages={{ ...sharedMessages, ...messages }}
      >
        <DateDisplayProvider>
          <div className="min-h-screen bg-bg p-3 text-fg sm:p-6">
            <Story />
          </div>
        </DateDisplayProvider>
      </FeatureMessagesProvider>
    ),
  ],
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  args: {
    entries: [entry],
    projectRef: "prj_story",
    retentionDays: null,
    timeZone: "UTC",
    rankingUrl: null,
    initialResults: data("available"),
    loadResults: async () => [data("available", true)],
    extendSnapshotAction: async () => ({ ok: true as const }),
  },
} satisfies Meta<typeof RetrievedResultsCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Available: Story = {};
export const Extended: Story = { args: { initialResults: data("available", true) } };
export const Expired: Story = { args: { initialResults: data("expired", true) } };
export const Unsupported: Story = {
  args: {
    initialResults: { ...data("unsupported"), provider: "dataforseo", providerLabel: "DataForSEO" },
  },
};
export const Failed: Story = { args: { initialResults: data("failed") } };
