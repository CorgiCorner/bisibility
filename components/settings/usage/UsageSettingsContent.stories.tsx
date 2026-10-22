import { withUsageSettingsMessages } from "@/.storybook/settings-shell-messages";
import { projectUsageFixture } from "@/lib/metering/shared-view-fixtures";
import { emptyProjectUsage } from "@/lib/metering/user-views";
import type { Meta, StoryObj } from "@storybook/react";
import { ProviderUsageCard } from "./ProviderUsageCard";

const meta = {
  title: "Settings/Usage",
  component: ProviderUsageCard,
  decorators: [withUsageSettingsMessages],
  args: {
    data: projectUsageFixture(),
    canEditBudget: false,
    projectId: "prj_story",
    projectRef: "prj_story",
  },
} satisfies Meta<typeof ProviderUsageCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ConnectionBudget: Story = {};
export const TwoBudgets: Story = {
  args: {
    data: {
      ...projectUsageFixture(),
      budgets: [
        ...projectUsageFixture().budgets,
        { ...projectUsageFixture().budgets[0], id: "second", unit: "customer_cents" },
      ],
    },
  },
};
export const NoBudgets: Story = { args: { data: { ...projectUsageFixture(), budgets: [] } } };
export const NoProviders: Story = {
  args: { data: { ...emptyProjectUsage(), status: "available" } },
};
export const NoUsage: Story = {
  args: {
    data: {
      ...emptyProjectUsage(),
      status: "available",
      connections: projectUsageFixture().connections,
    },
  },
};
export const MixedCentsUnits: Story = TwoBudgets;
export const NearLimit: Story = {
  args: {
    data: {
      ...projectUsageFixture(),
      budgets: projectUsageFixture().budgets.map((row) => ({
        ...row,
        level: "warning",
        used: { text: "86", unit: "units", certainty: "measured" },
      })),
    },
  },
};
export const PartialMeasurements: Story = {
  args: {
    data: {
      ...projectUsageFixture(),
      summary: { ...projectUsageFixture().summary, complete: false },
    },
  },
};
export const UsageUnknown: Story = { args: { data: emptyProjectUsage() } };
export const Loading: Story = UsageUnknown;
export const RouteLoading: Story = UsageUnknown;

export const TwentyProviders: Story = {
  args: {
    data: {
      ...projectUsageFixture(),
      connections: Array.from({ length: 20 }, (_, index) => ({
        connectionId: `conn_${index}`,
        provider: `Provider ${index + 1}`,
        credentialSource: "own" as const,
      })),
      budgets: [
        ...projectUsageFixture().budgets,
        ...Array.from({ length: 20 }, (_, index) => ({
          ...projectUsageFixture().budgets[0],
          id: `conn_${index}:app`,
          kind: "connection" as const,
          traffic: { kind: "surface" as const, surface: "app" as const },
          display: {
            connectionId: `conn_${index}`,
            projectName: "Example",
            providerLabel: `Provider ${index + 1}`,
          },
        })),
      ],
    },
  },
};
