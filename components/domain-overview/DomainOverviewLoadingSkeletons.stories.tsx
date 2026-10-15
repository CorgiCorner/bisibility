import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { domainOverviewFeatureTestMessages } from "@/i18n/test-support/feature-test-messages";
import type { Meta, StoryObj } from "@storybook/react";
import {
  DomainOverviewPageLoading,
  DomainOverviewResultsLoading,
} from "./DomainOverviewLoadingSkeletons";

const meta = {
  component: DomainOverviewPageLoading,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        timeZone="UTC"
        messages={domainOverviewFeatureTestMessages}
      >
        <div className="min-h-screen bg-bg text-fg">
          <Story />
        </div>
      </FeatureMessagesProvider>
    ),
  ],
  parameters: { layout: "fullscreen" },
  title: "Domain Overview/Loading",
} satisfies Meta<typeof DomainOverviewPageLoading>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RoutePage: Story = { args: { ariaLabel: "Domain Overview page loading" } };
export const Results: Story = {
  args: { ariaLabel: "Domain Overview loading" },
  render: () => <DomainOverviewResultsLoading ariaLabel="Domain Overview loading" />,
};
