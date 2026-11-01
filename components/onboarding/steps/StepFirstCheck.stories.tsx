import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { withSharedMessages } from "@/i18n/test-support/shared-messages-story-decorator";
import onboardingMessages from "@/messages/core/en/onboarding.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { StepFirstCheck } from "./StepFirstCheck";

const meta = {
  title: "Onboarding/FirstCheck",
  component: StepFirstCheck,
  decorators: [
    withSharedMessages,
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        messages={{ ...sharedMessages, ...onboardingMessages }}
        timeZone="UTC"
      >
        <div className="mx-auto max-w-3xl rounded-card border border-border bg-bg-elev p-6">
          <Story />
        </div>
      </FeatureMessagesProvider>
    ),
  ],
  args: {
    flowState: { projectId: "prj_example", providerId: "dataforseo" },
    keywordCount: 0,
    keywordDraft: "",
    providerConnected: true,
  },
  parameters: { nextjs: { appDirectory: true } },
} satisfies Meta<typeof StepFirstCheck>;

export default meta;
type Story = StoryObj<typeof meta>;

export const KeywordsSkipped: Story = {};
export const KeywordsAndProviderSkipped: Story = {
  args: { providerConnected: false },
};
