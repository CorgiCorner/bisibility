import { integrationCategories } from "@/components/integrations/integrations-fixtures";
import { ProviderCard } from "@/components/integrations/ProviderCard";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Integrations/ProviderCard",
  component: ProviderCard,
  args: {
    searchSyncPlan: { daysTotal: 93, pace: "gentle", retentionMonths: 3 },
    timeZone: "Europe/Warsaw",
  },
  decorators: [
    (Story) => (
      <div className="min-h-[360px] max-w-xl bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProviderCard>;

export default meta;

type Story = StoryObj<typeof meta>;

const serpProviders = integrationCategories[0].providers;
const analyticsProviders = integrationCategories[1].providers;
const searchImportProgress = { qualifyingDays: 5, targetDays: 28 };

export const ConnectedPrimary: Story = {
  args: { canManageProviders: true, canUpdateProject: true, provider: serpProviders[0] },
};

export const Ready: Story = {
  args: { canManageProviders: true, canUpdateProject: true, provider: analyticsProviders[1] },
};

export const UnreadableCredentials: Story = {
  args: {
    canManageProviders: true,
    canUpdateProject: true,
    provider: { ...serpProviders[0], credentialIssue: "unreadable" },
  },
};

export const DisabledConnected: Story = {
  args: {
    canManageProviders: true,
    canUpdateProject: true,
    provider: { ...serpProviders[0], enabled: false },
  },
};

export const NeedsReauth: Story = {
  args: {
    canManageProviders: true,
    canUpdateProject: true,
    provider: { ...analyticsProviders[0], enabled: true, status: "needs_reauth" },
  },
};

export const SearchBackfillTrafficNeverSynced: Story = {
  args: {
    canManageProviders: true,
    canUpdateProject: true,
    projectRef: "prj_storybook",
    provider: {
      ...analyticsProviders[0],
      consumerStatuses: {
        searchModule: {
          detail: "example.com",
          state: "backfill_running",
          summary: `Running · ${searchImportProgress.qualifyingDays} of ${searchImportProgress.targetDays} finalized days`,
        },
        trafficEnrichment: { state: "never_synced", summary: "Never synced" },
      },
      description: "One read-only Google connection for Search Insights and traffic enrichment.",
      enabled: true,
      meta: [],
      neverSynced: true,
    },
  },
};

export const SearchFirstViewReady: Story = {
  args: {
    canManageProviders: true,
    canUpdateProject: true,
    projectRef: "prj_storybook",
    provider: {
      ...analyticsProviders[0],
      consumerStatuses: {
        searchModule: {
          state: "first_view_ready",
          summary: "Running · 7-day view ready · history importing",
        },
        trafficEnrichment: { state: "last_synced", summary: "Last synced 3h ago" },
      },
      description: "One read-only Google connection for Search Insights and traffic enrichment.",
      enabled: true,
      meta: [],
    },
  },
};
