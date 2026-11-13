import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { emptyCostForm } from "@/lib/cost-items/form-state";
import type { CostFormValues } from "@/lib/cost-items/input";
import type { UsageCostsView } from "@/lib/cost-items/view";
import costs from "@/messages/core/en/project-usage-costs.json";
import shared from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";
import { CostDrawer } from "./CostDrawer";
import { UsageCosts } from "./UsageCosts";

const messages = mergeMessageCatalogs(shared, costs);
const idle = async () => {};
const projectId = "prj_storycurrent000000000";
const otherId = "prj_storyother00000000000";

const view: UsageCostsView = {
  canEdit: true,
  catalog: [
    {
      key: "ahrefs",
      kind: "seo_tool",
      logoDomain: "ahrefs.com",
      name: "Ahrefs",
      plans: ["Lite", "Standard"],
    },
  ],
  month: "2026-11",
  projectPublicId: projectId,
  projects: [
    { name: "Current", publicId: projectId },
    { name: "Other", publicId: otherId },
  ],
  rows: [
    {
      amountMinor: 10_000,
      billing: "monthly",
      catalogKey: "ahrefs",
      currency: "USD",
      endedOn: null,
      id: "cst_storymonthly",
      itemMonthlyMinor: 10_000,
      kind: "seo_tool",
      logoDomain: "ahrefs.com",
      name: "Ahrefs",
      note: null,
      planLabel: "Lite",
      priceChanges: [],
      projectShareMinor: 5_000,
      projects: [
        { basisPoints: null, name: "Current", publicId: projectId },
        { basisPoints: null, name: "Other", publicId: otherId },
      ],
      split: "equal",
      startedOn: "2026-01-01",
    },
  ],
  suggestHref: "/roadmap",
  tiles: {
    custom: [],
    provider: [{ currency: "USD", minor: 125 }],
    seo: [{ currency: "USD", minor: 5_125 }],
    subscriptions: [{ currency: "USD", minor: 5_000 }],
  },
  today: "2026-11-10",
};

function Frame({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <FeatureMessagesProvider locale="en" messages={messages} timeZone="UTC">
      <div className="bg-bg p-6">{children}</div>
    </FeatureMessagesProvider>
  );
}

const meta = {
  component: UsageCosts,
  decorators: [
    (Story) => (
      <Frame>
        <Story />
      </Frame>
    ),
  ],
  title: "Usage/Costs",
} satisfies Meta<typeof UsageCosts>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithItems: Story = {
  args: {
    createItem: idle,
    deleteItem: idle,
    endItem: idle,
    updateItem: idle,
    view,
  },
};

function drawer(initial: CostFormValues): Story {
  return {
    args: WithItems.args,
    render: () => (
      <CostDrawer
        catalog={view.catalog}
        initial={initial}
        mode="create"
        onClose={() => undefined}
        onSubmit={idle}
        open
        projectPublicId={projectId}
        suggestHref="/roadmap"
      />
    ),
  };
}

const base = { ...emptyCostForm(projectId, "2026-11-01"), amount: "29.00", name: "Ahrefs" };

export const Monthly: Story = drawer({ ...base, billing: "monthly" });
export const Yearly: Story = drawer({ ...base, billing: "yearly" });
export const Lifetime: Story = drawer({ ...base, billing: "lifetime" });
export const OneOff: Story = drawer({ ...base, billing: "one_off" });
export const EqualSplit: Story = drawer({
  ...base,
  projectIds: [projectId, otherId],
  split: "equal",
});
export const PercentSplit: Story = drawer({
  ...base,
  percents: { [otherId]: "40", [projectId]: "60" },
  projectIds: [projectId, otherId],
  split: "percent",
});
export const ThisProjectOnly: Story = drawer({ ...base, split: "single_project" });
export const MobileSheet: Story = {
  ...drawer(base),
  parameters: { viewport: { defaultViewport: "mobile1" } },
};

export const CatalogPlan: Story = drawer({ ...base, catalogKey: "ahrefs", planLabel: "Lite" });
