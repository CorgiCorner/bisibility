import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { projectUsageFixture } from "@/lib/metering/shared-view-fixtures";
import usageMessages from "@/messages/core/en/project-settings-usage.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { UsageSummary } from "./UsageSummary";

const data = projectUsageFixture();
const byok = data.detail.rows[0];
if (!byok) throw new Error("Missing usage fixture");
const credits = { text: "13.0001", unit: "customer_cents", certainty: "measured" as const };
const requests = { text: "3", unit: "requests", certainty: "measured" as const };
data.summary.funding = [
  ...data.summary.funding,
  {
    key: "platform",
    fundingSource: "platform",
    costOwner: "",
    cost: { text: "", unit: "cents", certainty: "unknown" },
    measurements: { customer_cents: credits, requests },
    unknownOperations: "0",
  },
];
data.detail.units = ["requests", "customer_cents"];
data.detail.rows = [
  { ...byok, units: { requests } },
  {
    ...byok,
    key: "platform",
    fundingSource: "platform",
    dimensions: { ...byok.dimensions, provider: "serpapi" },
    units: { requests, customer_cents: credits },
  },
];
const meta = {
  title: "Integrations/UsageSummary",
  component: UsageSummary,
  args: { data },
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        messages={{ ...sharedMessages, ...usageMessages }}
        timeZone="UTC"
      >
        <div className="mx-auto max-w-5xl p-4">
          <Story />
        </div>
      </FeatureMessagesProvider>
    ),
  ],
} satisfies Meta<typeof UsageSummary>;
export default meta;
type Story = StoryObj<typeof meta>;
export const MixedFunding: Story = {};
