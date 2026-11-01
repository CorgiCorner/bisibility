import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import en from "@/messages/core/en/project-integrations.json";
import pl from "@/messages/core/pl/project-integrations.json";
import type { Meta, StoryObj } from "@storybook/react";
import { type BillingConnection, ProviderBillingCard } from "./ProviderBillingCard";

const own: BillingConnection[] = Array.from({ length: 15 }, (_, index) => ({
  connectionId: `connection-${index}`,
  providerId: "serpapi",
  label: `Provider ${index + 1}`,
  credentialSource: "own",
  billable: true,
}));
const meta = {
  title: "Providers/Billing sources",
  component: ProviderBillingCard,
  args: { connections: own, manageHref: "#connections" },
  decorators: [
    (Story) => (
      <FeatureMessagesProvider locale="en" messages={en} timeZone="UTC">
        <div className="max-w-[760px] p-4">
          <Story />
        </div>
      </FeatureMessagesProvider>
    ),
  ],
} satisfies Meta<typeof ProviderBillingCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const FifteenProviders: Story = {};
export const CreditsOnly: Story = {
  args: { connections: [{ ...own[0], credentialSource: "hosted" }] },
};
export const NoConnections: Story = { args: { connections: [] } };
export const Mobile: Story = { parameters: { viewport: { defaultViewport: "mobile1" } } };
export const Polish: Story = {
  decorators: [
    (Story) => (
      <FeatureMessagesProvider locale="pl" messages={pl} timeZone="UTC">
        <Story />
      </FeatureMessagesProvider>
    ),
  ],
};
