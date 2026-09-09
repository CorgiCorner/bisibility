import { IntegrationCategory } from "@/components/integrations/IntegrationCategory";
import { integrationCategories } from "@/components/integrations/integrations-fixtures";
import type { IntegrationCategoryData } from "@/lib/integrations/types";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Integrations/IntegrationCategory",
  component: IntegrationCategory,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  args: {
    searchSyncPlan: { daysTotal: 93, pace: "gentle", retentionMonths: 3 },
    timeZone: "Europe/Warsaw",
  },
  decorators: [
    (Story) => (
      <div className="min-h-[560px] bg-bg p-4 text-fg sm:p-6">
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

const compactCategories: IntegrationCategoryData[] = [
  {
    ...integrationCategories[0],
    providers: [
      ...integrationCategories[0].providers.map((provider) => ({
        ...provider,
        status: "ready" as const,
        primary: false,
        secondaryAction: undefined,
      })),
      {
        ...integrationCategories[0].providers[1],
        id: "local-sequence",
        name: "Local rank test",
        icon: "database",
        logoDomain: undefined,
        description: "Add [seq:5,15,15,4] to choose the ranks returned for a keyword.",
        status: "ready",
        secondaryAction: undefined,
      },
    ],
  },
  {
    ...integrationCategories[1],
    providers: integrationCategories[1].providers.map((provider) =>
      provider.id === "gsc"
        ? {
            ...provider,
            enabled: true,
            meta: [],
            consumerStatuses: {
              searchModule: {
                detail: "example.com",
                state: "backfill_running",
                summary: "Importing · 32 of 64 finalized days are imported · Import is running.",
              },
              trafficEnrichment: { state: "never_synced", summary: "Never synced" },
            },
          }
        : provider.id === "ga4"
          ? {
              ...provider,
              status: "connected",
              enabled: true,
              primary: true,
              secondaryAction: "Test",
              neverSynced: true,
              meta: [
                { label: "Property", value: "545703482" },
                { label: "Last sync", value: "Never" },
                { label: "State", value: "Enabled" },
              ],
            }
          : provider,
    ),
  },
];

export const CompactOverview: Story = {
  args: {
    canManageProviders: true,
    canUpdateProject: true,
    category: compactCategories[0],
    projectRef: "prj_storybook",
  },
  render: (args) => (
    <div className="mx-auto max-w-6xl space-y-6">
      {compactCategories.map((category) => (
        <IntegrationCategory {...args} category={category} key={category.id} />
      ))}
    </div>
  ),
};

export const ReadOnlyOverview: Story = {
  ...CompactOverview,
  args: { ...CompactOverview.args, canManageProviders: false, canUpdateProject: false },
};

export const AnalyticsSources: Story = {
  args: {
    canManageProviders: true,
    canUpdateProject: true,
    category: integrationCategories[1],
  },
};

export const UnavailableImport: Story = {
  args: {
    ...CompactOverview.args,
    category: {
      ...compactCategories[1],
      providers: compactCategories[1].providers.map((provider) =>
        provider.consumerStatuses
          ? {
              ...provider,
              consumerStatuses: {
                ...provider.consumerStatuses,
                searchModule: {
                  ...provider.consumerStatuses.searchModule,
                  summary:
                    "Status unavailable · 33 of 64 finalized days are imported · Current runtime facts are unavailable. Refresh the page to check again.",
                },
              },
            }
          : provider,
      ),
    },
  },
  render: (args) => (
    <div className="mx-auto max-w-6xl">
      <IntegrationCategory {...args} />
    </div>
  ),
};
