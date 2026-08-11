import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import { UsageCardsLoading, UsageLoading } from "@/components/settings/usage/UsageLoading";
import { UsageSettingsContent } from "@/components/settings/usage/UsageSettingsContent";
import type { ProviderUsageData } from "@/lib/settings/options";
import type { Meta, StoryObj } from "@storybook/react";

const projectId = "prj_story";

const usage: ProviderUsageData = {
  budget: { capCents: 5_000, spentCents: 1_240 },
  connections: [
    {
      connectionId: "conn_primary",
      costPerCheck: "$0.0006",
      lookups: { costCents: 494, count: 4_120 },
      primary: true,
      provider: "DataForSEO",
      rankChecks: { costCents: 446, count: 7_440 },
    },
    {
      connectionId: "conn_secondary",
      costPerCheck: "$0.0150",
      lookups: { costCents: 297, count: 1_485 },
      primary: false,
      provider: "SerpApi",
      rankChecks: { costCents: 3, count: 2 },
    },
  ],
  hasProvider: true,
  onPaceCents: 1_750,
  primaryProvider: "DataForSEO",
  serpChecksMonth: "7,442",
};

const actions = {
  submitPricingFeedback: async () => ({ answered: true as const }),
  updateBudget: async () => ({ capCents: 7_500 }),
};

const meta = {
  component: UsageSettingsContent,
  args: {
    ...actions,
    canEditBudget: true,
    canSubmitPricingFeedback: true,
    deployment: "cloud",
    projectId,
    usage,
  },
  decorators: [
    (Story, context) => (
      <main className="min-h-screen bg-bg p-4 text-fg sm:p-6">
        {context.parameters.settingsRouteLoading ? (
          <Story />
        ) : (
          <SettingsShell activeSection="usage" projectRef={projectId}>
            <Story />
          </SettingsShell>
        )}
      </main>
    ),
  ],
  parameters: { nextjs: { appDirectory: true } },
  title: "Settings/Usage & billing",
} satisfies Meta<typeof UsageSettingsContent>;

export default meta;

type Story = StoryObj<typeof meta>;

export const StateSelfHostedInstance: Story = {
  args: { deployment: "self-host" },
  name: "STATE · SELF-HOSTED INSTANCE",
};

export const StateHostedBetaAccount: Story = {
  name: "STATE · HOSTED BETA ACCOUNT",
};

export const StateAnswered: Story = {
  args: { initialPricingFeedbackAnswered: true },
  name: "STATE · ANSWERED",
};

export const Loading: Story = {
  render: () => <UsageCardsLoading />,
};

export const RouteLoading: Story = {
  name: "Route loading",
  parameters: { settingsRouteLoading: true },
  render: () => <UsageLoading />,
};
