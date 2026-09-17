import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { SampleProjectBanner } from "@/components/sample-data/SampleProjectBanner";
import { ToastProvider } from "@/components/ui/Toast";
import messages from "@/messages/core/en/project-dashboard.json";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Overview/SampleProjectBanner",
  component: SampleProjectBanner,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider locale="en" messages={messages} timeZone="UTC">
        <ToastProvider>
          <div className="min-h-[220px] bg-bg p-6 text-fg">
            <div className="max-w-5xl">
              <Story />
            </div>
          </div>
        </ToastProvider>
      </FeatureMessagesProvider>
    ),
  ],
} satisfies Meta<typeof SampleProjectBanner>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { projectId: "prj_sample" },
};
