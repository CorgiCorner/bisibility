import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import type { ProjectBudgetRow } from "@/lib/metering/project-budget-display";
import { budgetFixture, headerFixture } from "@/lib/metering/shared-view-fixtures";
import costEstimateMessages from "@/messages/core/en/project-cost-estimate.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { HeaderProviderSpend } from "./HeaderProviderSpend";

const meta = {
  title: "Components/Provider cap",
  component: HeaderProviderSpend,
  args: { projectRef: "prj_example", summary: headerFixture() },
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        messages={mergeMessageCatalogs(sharedMessages, costEstimateMessages)}
        timeZone="UTC"
      >
        <Story />
      </FeatureMessagesProvider>
    ),
  ],
  parameters: { nextjs: { appDirectory: true } },
} satisfies Meta<typeof HeaderProviderSpend>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Known: Story = {};
export const NoCap: Story = { args: { summary: headerFixture([]) } };
export const Unavailable: Story = { args: { summary: null } };
export const Partial: Story = {
  args: {
    summary: headerFixture([
      { ...budgetFixture(), used: { text: "62.75", unit: "units", certainty: "estimated" } },
    ]),
  },
};
export const Unknown: Story = {
  args: {
    summary: headerFixture([{ ...budgetFixture(), used: "unavailable", level: "unavailable" }]),
  },
};
export const NearLimit: Story = {
  args: { summary: headerFixture([{ ...budgetFixture("86"), level: "warning" }]) },
};
export const OverLimit: Story = {
  args: { summary: headerFixture([{ ...budgetFixture("100"), level: "exceeded" }]) },
};

export const MixedBudgets: Story = {
  args: {
    summary: headerFixture([
      {
        ...budgetFixture("7.4071", "cents"),
        limit: { text: "5000", unit: "cents", certainty: "measured" },
      },
      {
        ...budgetFixture("1", "requests"),
        id: "requests",
        limit: { text: "10", unit: "requests", certainty: "measured" },
      },
      ...["api", "sdk", "cli"].map((id) => ({
        ...budgetFixture(),
        id,
        traffic: { kind: "source" as const, source: id as "api" | "sdk" | "cli" },
        used: "unavailable" as const,
        level: "unavailable" as const,
      })),
    ]),
  },
};

export const NoLimit: Story = {
  args: {
    summary: headerFixture([
      {
        ...budgetFixture(),
        limit: "unlimited",
        reserved: { text: "0", unit: "units", certainty: "estimated" },
      },
    ]),
  },
};

export const Reserved: Story = {
  args: {
    summary: headerFixture([
      { ...budgetFixture("0"), reserved: { text: "10", unit: "units", certainty: "estimated" } },
    ]),
  },
};

const trafficRows: ProjectBudgetRow[] = [
  {
    ...budgetFixture("0", "cents"),
    id: "project",
    display: { projectName: "webscraping.app" },
    limit: { text: "5000", unit: "cents", certainty: "measured" },
  },
  {
    ...budgetFixture("0"),
    id: "app",
    kind: "connection",
    traffic: { kind: "surface", surface: "app" },
    display: { projectName: "webscraping.app", providerLabel: "SerpApi" },
  },
  {
    ...budgetFixture("0"),
    id: "agents",
    kind: "connection",
    traffic: { kind: "surface", surface: "programmatic" },
    display: { projectName: "webscraping.app", providerLabel: "SerpApi" },
  },
];

export const TrafficChannels: Story = {
  args: {
    summary: {
      ...headerFixture(),
      budgets: {
        ...headerFixture().budgets,
        rows: trafficRows,
      },
    },
  },
};
