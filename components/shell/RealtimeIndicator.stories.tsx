import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { AppRealtimeContext, type AppRealtimeStatus } from "@/lib/realtime/useAppRealtime";
import messages from "@/messages/core/en/shell.json";
import type { Meta, StoryObj } from "@storybook/react";
import { RealtimeIndicator } from "./RealtimeIndicator";

function IndicatorStory({ status }: Readonly<{ status: AppRealtimeStatus }>) {
  return (
    <FeatureMessagesProvider locale="en" messages={messages} timeZone="UTC">
      <AppRealtimeContext.Provider value={{ notifications: null, operations: [], status }}>
        <RealtimeIndicator />
      </AppRealtimeContext.Provider>
    </FeatureMessagesProvider>
  );
}
const meta = { title: "Components/RealtimeIndicator", component: IndicatorStory } satisfies Meta<
  typeof IndicatorStory
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Live: Story = { args: { status: "live" } };
export const Reconnecting: Story = { args: { status: "reconnecting" } };
