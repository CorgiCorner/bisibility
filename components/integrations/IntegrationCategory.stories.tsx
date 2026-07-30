import { IntegrationCategory } from "@/components/integrations/IntegrationCategory";
import { integrationCategories } from "@/components/integrations/integrations-fixtures";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Integrations/IntegrationCategory",
  component: IntegrationCategory,
  decorators: [
    (Story) => (
      <div className="min-h-[560px] bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof IntegrationCategory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const SerpProviders: Story = {
  args: {
    canManageProviders: true,
    canUpdateProject: true,
    category: integrationCategories[0],
  },
};

export const AnalyticsSources: Story = {
  args: {
    canManageProviders: true,
    canUpdateProject: true,
    category: integrationCategories[1],
  },
};
