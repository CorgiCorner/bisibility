import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import shellMessages from "@/messages/core/en/project-settings-shell.json";
import usageMessages from "@/messages/core/en/project-settings-usage.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { MeterUsageCard } from "./MeterUsageCard";
import { emptyMeterUsage, partialMeterUsage } from "./meter-usage-fixtures";

const meta = {
  id: "integrations-meter-usage",
  title: "Integrations/MeterUsageCard",
  component: MeterUsageCard,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        messages={{ ...sharedMessages, ...shellMessages, ...usageMessages }}
        timeZone="UTC"
      >
        <div className="max-w-[760px] p-4">
          <Story />
        </div>
      </FeatureMessagesProvider>
    ),
  ],
} satisfies Meta<typeof MeterUsageCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const NoObservations: Story = { args: { data: emptyMeterUsage } };
export const PartialCoverageAndUnknownExposure: Story = { args: { data: partialMeterUsage } };
export const Unavailable: Story = { args: { data: { ...emptyMeterUsage, status: "unavailable" } } };
export const Restricted: Story = { args: { data: { ...emptyMeterUsage, status: "restricted" } } };
