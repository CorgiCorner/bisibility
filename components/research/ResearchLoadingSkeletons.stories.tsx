import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { researchFeatureTestMessages } from "@/i18n/test-support/feature-test-messages";
import type { Meta, StoryObj } from "@storybook/react";
import { ResearchPageLoading, ResearchResultsLoading } from "./ResearchLoadingSkeletons";

const meta = {
  component: ResearchPageLoading,
  args: { variant: "analytics" },
  decorators: [
    (Story) => (
      <FeatureMessagesProvider locale="en" timeZone="UTC" messages={researchFeatureTestMessages}>
        <div className="min-h-screen bg-bg p-4 text-fg sm:p-6">
          <Story />
        </div>
      </FeatureMessagesProvider>
    ),
  ],
  parameters: { layout: "fullscreen" },
  title: "Research/Loading",
} satisfies Meta<typeof ResearchPageLoading>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Page: Story = {};

export const Results: Story = {
  render: () => <ResearchResultsLoading ariaLabel="Research loading" />,
};
