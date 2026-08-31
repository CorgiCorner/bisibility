import { UsageCardsLoading, UsageLoading } from "@/components/settings/usage/UsageLoading";
import {
  UsageSettingsContent,
  type UsageSettingsContentProps,
} from "@/components/settings/usage/UsageSettingsContent";
import type { ProviderSpendConnection, ProviderSpendSummary } from "@/lib/queries/provider-spend";
import type { Meta, StoryObj } from "@storybook/react";

const period = {
  daysUntilReset: 8,
  endsAt: "2026-09-01T00:00:00.000Z",
  monthLabel: "August 2026",
  startsAt: "2026-08-01T00:00:00.000Z",
};
const usage = {
  budget: { capCents: 3000, spentCents: 10 },
  connections: [],
  hasProvider: true,
  onPaceCents: null,
  period: {
    dateFormat: "long",
    endAt: "2026-09-01T00:00:00.000Z",
    endLabel: "Aug 31, 2026",
    label: "August 2026",
    now: "2026-08-24T17:03:00.000Z",
    resetsLabel: "resets in 8 days",
    timezone: "UTC",
  },
  primaryProvider: "SerpApi",
  serpChecksMonth: "0",
} as const;

function dataForSeoFeatures(costCents = 0, count = 0) {
  return [
    { costCents, count, feature: "rank_check", label: "Rank checks" },
    { costCents: 0, count: 0, feature: "keyword_research", label: "Keyword research" },
    { costCents: 0, count: 0, feature: "keyword_metrics", label: "Keyword metrics" },
    { costCents: 0, count: 0, feature: "ranked_keywords", label: "Ranked keywords" },
    { costCents: 0, count: 0, feature: "backlinks", label: "Backlinks" },
    { costCents: 0, count: 0, feature: "domain_overview", label: "Domain overview" },
  ] as ProviderSpendConnection["features"];
}

function serpApiFeatures(count = 0) {
  return [
    { costCents: 0, count, feature: "rank_check", label: "Rank checks" },
  ] as ProviderSpendConnection["features"];
}

function connection(
  input: Partial<ProviderSpendConnection> &
    Pick<ProviderSpendConnection, "provider" | "providerId">,
): ProviderSpendConnection {
  const { provider, providerId, ...overrides } = input;
  const unit = overrides.unit ?? "cents";
  return {
    allocation: null,
    allocationSource: "none",
    billing: unit === "units" ? "quota" : "metered",
    connectionId: `conn_${providerId}`,
    enabled: true,
    features: providerId === "serpapi" ? serpApiFeatures() : dataForSeoFeatures(),
    primary: false,
    projectedExhaustionAt: null,
    provider,
    providerId,
    quotaReset: unit === "units" ? "billing_cycle" : "none",
    remaining: null,
    requestCount: 0,
    state: "no_allocation",
    status: "connected",
    unit,
    used: 0,
    usedPercent: null,
    ...overrides,
  };
}

function providerSpend(connections: ProviderSpendConnection[], summary: ProviderSpendSummary) {
  return { connections, summary };
}
const meta = {
  component: UsageSettingsContent,
  args: {
    canEditBudget: true,
    canSubmitPricingFeedback: true,
    deployment: "cloud",
    projectId: "prj_story",
    projectRef: "prj_story",
    submitPricingFeedback: async () => ({ answered: true as const }),
    updateProviderAllocation: async () => {
      throw new Error("Story action");
    },
    usage: usage as unknown as UsageSettingsContentProps["usage"],
  },
  title: "Settings/Usage and billing",
} satisfies Meta<typeof UsageSettingsContent>;
export default meta;
type Story = StoryObj<typeof meta>;
export const LegacyProject: Story = {
  args: {
    usage: {
      ...usage,
      providerSpend: providerSpend(
        [
          connection({
            allocation: { amountPerMonth: 5000, unit: "cents" },
            allocationSource: "legacy_project",
            availableAtProvider: {
              amount: 12.4,
              checkedAt: "2026-08-24T17:03:00.000Z",
              status: "available",
              unit: "usd",
            },
            features: dataForSeoFeatures(1240, 12),
            primary: true,
            provider: "DataForSEO",
            providerId: "dataforseo",
            remaining: 3760,
            requestCount: 12,
            state: "ok",
            used: 1240,
            usedPercent: 24.8,
          }),
        ],
        {
          attention: [],
          maxUsedPercent: 24.8,
          period,
          projected: { kind: "within_limits" },
          recorded: { cents: 1240, units: 0 },
          requestCount: 12,
          tightest: { connectionId: "conn_dataforseo", provider: "DataForSEO", usedPercent: 24.8 },
        },
      ),
    } as UsageSettingsContentProps["usage"],
  },
  name: "Provider spend/Legacy project",
};

export const MixedCentsUnits: Story = {
  args: {
    usage: {
      ...usage,
      providerSpend: providerSpend(
        [
          connection({
            allocation: { amountPerMonth: 100, unit: "units" },
            availableAtProvider: {
              amount: 222,
              checkedAt: "2026-08-24T16:57:00.000Z",
              status: "available",
              unit: "searches",
            },
            features: serpApiFeatures(28),
            primary: true,
            provider: "SerpApi",
            providerId: "serpapi",
            remaining: 72,
            requestCount: 28,
            state: "ok",
            unit: "units",
            used: 28,
            usedPercent: 28,
          }),
          connection({
            allocation: { amountPerMonth: 3000, unit: "cents" },
            allocationSource: "connection",
            availableAtProvider: {
              amount: 12.4,
              checkedAt: "2026-08-24T16:57:00.000Z",
              status: "available",
              unit: "usd",
            },
            features: dataForSeoFeatures(10, 1),
            provider: "DataForSEO",
            providerId: "dataforseo",
            remaining: 2990,
            requestCount: 1,
            state: "ok",
            used: 10,
            usedPercent: 0.33,
          }),
        ],
        {
          attention: [],
          maxUsedPercent: 28,
          period,
          projected: { kind: "within_limits" },
          recorded: { cents: 10, units: 28 },
          requestCount: 29,
          tightest: { connectionId: "conn_serpapi", provider: "SerpApi", usedPercent: 28 },
        },
      ),
    } as UsageSettingsContentProps["usage"],
  },
  name: "Provider spend/Mixed cents and units",
};

export const CappedFallback: Story = {
  args: {
    usage: {
      ...usage,
      providerSpend: providerSpend(
        [
          connection({
            allocation: { amountPerMonth: 100, unit: "units" },
            availableAtProvider: {
              amount: 222,
              checkedAt: "2026-08-24T16:57:00.000Z",
              status: "available",
              unit: "searches",
            },
            features: serpApiFeatures(100),
            primary: true,
            provider: "SerpApi",
            providerId: "serpapi",
            remaining: 0,
            requestCount: 100,
            state: "fallback_active",
            unit: "units",
            used: 100,
            usedPercent: 100,
          }),
          connection({
            allocation: { amountPerMonth: 3000, unit: "cents" },
            allocationSource: "connection",
            availableAtProvider: {
              amount: 12.4,
              checkedAt: "2026-08-24T16:57:00.000Z",
              status: "available",
              unit: "usd",
            },
            features: dataForSeoFeatures(10, 1),
            provider: "DataForSEO",
            providerId: "dataforseo",
            remaining: 2990,
            requestCount: 1,
            state: "ok",
            used: 10,
            usedPercent: 0.33,
          }),
        ],
        {
          attention: ["conn_serpapi"],
          maxUsedPercent: 100,
          period,
          projected: { at: "2026-08-27T00:00:00.000Z", kind: "cap_by", provider: "SerpApi" },
          recorded: { cents: 10, units: 100 },
          requestCount: 101,
          tightest: { connectionId: "conn_serpapi", provider: "SerpApi", usedPercent: 100 },
        },
      ),
    } as UsageSettingsContentProps["usage"],
  },
  name: "Provider spend/Capped fallback banner",
};

export const TopUpRequired: Story = {
  args: {
    usage: {
      ...usage,
      providerSpend: providerSpend(
        [
          connection({
            allocation: { amountPerMonth: 5000, unit: "cents" },
            allocationSource: "connection",
            availableAtProvider: {
              amount: 0,
              checkedAt: "2026-08-24T17:03:00.000Z",
              status: "available",
              unit: "usd",
            },
            features: dataForSeoFeatures(1240, 12),
            primary: true,
            provider: "DataForSEO",
            providerId: "dataforseo",
            remaining: 3760,
            requestCount: 12,
            state: "top_up_required",
            used: 1240,
            usedPercent: 24.8,
          }),
        ],
        {
          attention: ["conn_dataforseo"],
          maxUsedPercent: 24.8,
          period,
          projected: { kind: "within_limits" },
          recorded: { cents: 1240, units: 0 },
          requestCount: 12,
          tightest: { connectionId: "conn_dataforseo", provider: "DataForSEO", usedPercent: 24.8 },
        },
      ),
    } as UsageSettingsContentProps["usage"],
  },
  name: "Provider spend/Top up required",
};

export const NoBudgets: Story = {
  args: {
    usage: {
      ...usage,
      providerSpend: providerSpend(
        [
          connection({
            features: serpApiFeatures(28),
            primary: true,
            provider: "SerpApi",
            providerId: "serpapi",
            requestCount: 28,
            state: "no_allocation",
            unit: "units",
            used: 28,
          }),
          connection({
            features: dataForSeoFeatures(10, 1),
            provider: "DataForSEO",
            providerId: "dataforseo",
            requestCount: 1,
            state: "no_allocation",
            used: 10,
          }),
        ],
        {
          attention: [],
          maxUsedPercent: null,
          period,
          projected: { kind: "within_limits" },
          recorded: { cents: 10, units: 28 },
          requestCount: 29,
          tightest: null,
        },
      ),
    } as UsageSettingsContentProps["usage"],
  },
  name: "Provider spend/No budgets",
};

export const NoUsage: Story = {
  args: {
    usage: {
      ...usage,
      providerSpend: providerSpend(
        [
          connection({
            allocation: { amountPerMonth: 100, unit: "units" },
            features: serpApiFeatures(),
            primary: true,
            provider: "SerpApi",
            providerId: "serpapi",
            remaining: 100,
            state: "ok",
            unit: "units",
            usedPercent: 0,
          }),
          connection({
            allocation: { amountPerMonth: 3000, unit: "cents" },
            allocationSource: "connection",
            features: dataForSeoFeatures(),
            provider: "DataForSEO",
            providerId: "dataforseo",
            remaining: 3000,
            state: "ok",
            usedPercent: 0,
          }),
        ],
        {
          attention: [],
          maxUsedPercent: 0,
          period,
          projected: { kind: "no_usage" },
          recorded: { cents: 0, units: 0 },
          requestCount: 0,
          tightest: { connectionId: "conn_serpapi", provider: "SerpApi", usedPercent: 0 },
        },
      ),
    } as UsageSettingsContentProps["usage"],
  },
  name: "Provider spend/No usage",
};

export const NoProviders: Story = {
  args: {
    usage: {
      ...usage,
      providerSpend: providerSpend([], {
        attention: [],
        maxUsedPercent: null,
        period,
        projected: { kind: "no_usage" },
        recorded: { cents: 0, units: 0 },
        requestCount: 0,
        tightest: null,
      }),
    } as UsageSettingsContentProps["usage"],
  },
  name: "Provider spend/No providers",
};
export const Loading: Story = { args: {}, render: () => <UsageCardsLoading /> };
export const RouteLoading: Story = { args: {}, render: () => <UsageLoading /> };
