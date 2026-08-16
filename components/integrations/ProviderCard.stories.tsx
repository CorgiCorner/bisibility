import { integrationCategories } from "@/components/integrations/integrations-fixtures";
import { ProviderCard } from "@/components/integrations/ProviderCard";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Integrations/ProviderCard",
  component: ProviderCard,
  args: { timeZone: "Europe/Warsaw" },
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
