import { withIntegrationMessages } from "@/.storybook/with-integration-messages";
import { integrationCategories } from "@/components/integrations/integrations-fixtures";
import { ProviderCard } from "@/components/integrations/ProviderCard";
import type { Meta, StoryObj } from "@storybook/react";
import { useEffect, useRef } from "react";

const meta = {
  title: "Integrations/ProviderCard",
  component: ProviderCard,
  parameters: { nextjs: { appDirectory: true } },
  args: {
    searchSyncPlan: { daysTotal: 93, pace: "gentle", retentionMonths: 3 },
    timeZone: "Europe/Warsaw",
  },
  decorators: [
    withIntegrationMessages,
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

export const BillingRecovery: Story = {
  args: {
    canManageProviders: true,
    canUpdateProject: true,
    projectId: "prj_aaaaaaaaaaaaaaaaaaaaaaaa",
    provider: {
      ...serpProviders[0],
      connectionId: "conn_aaaaaaaaaaaaaaaaaaaaaaaa",
      recovery: {
        state: "billing",
        accountVerified: false,
        checkedAt: null,
        affectedChecks: 11,
        unconfirmedRequests: 11,
        revision: "billing-11",
        paused: true,
      },
    },
  },
};

export const RecoveryUnderReview: Story = {
  args: {
    ...BillingRecovery.args,
    provider: {
      ...serpProviders[0],
      connectionId: "conn_aaaaaaaaaaaaaaaaaaaaaaaa",
      recovery: {
        state: "review",
        accountVerified: true,
        checkedAt: "2026-10-28T14:00:00Z",
        affectedChecks: 11,
        unconfirmedRequests: 11,
        revision: "review-11",
        paused: true,
      },
    },
  },
};

const accountBlock = {
  state: "billing" as const,
  reason: "provider_billing" as const,
  accountVerified: false,
  checkedAt: null,
  affectedChecks: 0,
  checksNotSent: 13,
  currentIncidentChecksNotSent: 13,
  unconfirmedRequests: 0,
  revision: "account-block",
  paused: true,
  canCheck: true,
  rangeEnd: "2026-10-29T12:00:00Z",
};
const blockedDataForSeo = {
  ...serpProviders[0],
  status: "connected" as const,
  enabled: true,
  connectionId: "conn_aaaaaaaaaaaaaaaaaaaaaaaa",
  accountUrl: "https://app.dataforseo.com/",
  recovery: accountBlock,
};
const blockedSerpApi = {
  ...serpProviders[1],
  status: "connected" as const,
  enabled: true,
  connectionId: "conn_bbbbbbbbbbbbbbbbbbbbbbbb",
  accountUrl: "https://serpapi.com/change-plan",
  recovery: { ...accountBlock, capacityUnit: "searches" as const },
};
const accountArgs = {
  canManageProviders: true,
  canUpdateProject: true,
  projectId: "prj_aaaaaaaaaaaaaaaaaaaaaaaa",
};
export const AccountBilling: Story = { args: { ...accountArgs, provider: blockedDataForSeo } };
export const AccountSearchesExhausted: Story = {
  args: { ...accountArgs, provider: blockedSerpApi },
};
export const AccountCredentialsRejected: Story = {
  args: {
    ...accountArgs,
    provider: {
      ...blockedDataForSeo,
      recovery: { ...accountBlock, state: "review", reason: "provider_auth" },
    },
  },
};
export const AccountScopedRestriction: Story = {
  args: {
    ...accountArgs,
    provider: {
      ...blockedDataForSeo,
      recovery: {
        ...accountBlock,
        state: "review",
        reason: "provider_account_restricted",
        scope: { kind: "capability", capability: "rank_check" },
      },
    },
  },
};
export const AccountUnsupportedProbe: Story = {
  args: {
    ...accountArgs,
    provider: { ...blockedDataForSeo, recovery: { ...accountBlock, canCheck: false } },
  },
};
export const AccountChecking: Story = {
  args: {
    ...accountArgs,
    provider: { ...blockedDataForSeo, recovery: { ...accountBlock, checking: true } },
  },
};
export const AccountFallbackActive: Story = {
  args: {
    ...accountArgs,
    provider: { ...blockedDataForSeo, recovery: { ...accountBlock, anotherActive: true } },
  },
};
export const AccountAccountingReview: Story = {
  args: {
    ...accountArgs,
    provider: {
      ...blockedDataForSeo,
      recovery: {
        ...accountBlock,
        state: "review",
        reason: "accounting_review",
        accountVerified: true,
        unconfirmedRequests: 2,
      },
    },
  },
};
export const AccountReader: Story = {
  args: {
    ...accountArgs,
    canManageProviders: false,
    canUpdateProject: false,
    provider: blockedDataForSeo,
  },
};
export const AccountBothBlocked: Story = {
  args: { ...accountArgs, provider: blockedDataForSeo },
  render: (args) => (
    <div className="grid gap-3">
      <ProviderCard {...args} />
      <ProviderCard {...args} provider={blockedSerpApi} />
    </div>
  ),
};
export const AccountMultipleConnections: Story = {
  args: { ...accountArgs, provider: blockedDataForSeo },
  render: (args) => (
    <div className="grid gap-3">
      <ProviderCard {...args} />
      <ProviderCard
        {...args}
        provider={{
          ...blockedSerpApi,
          recovery: {
            ...accountBlock,
            state: "review",
            reason: "provider_auth",
            revision: "second",
          },
        }}
      />
    </div>
  ),
};
function DismissedCard(args: React.ComponentProps<typeof ProviderCard>) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const button = [...(root.current?.querySelectorAll("button") ?? [])].find(
      (element) => element.textContent === "Dismiss",
    );
    button?.click();
  }, []);
  return (
    <div ref={root}>
      <ProviderCard {...args} />
    </div>
  );
}

export const AccountDismissed: Story = {
  args: { ...accountArgs, provider: blockedDataForSeo },
  render: (args) => <DismissedCard {...args} />,
};
