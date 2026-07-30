import type { Meta, StoryObj } from "@storybook/react";
import { BacklinksPageLoading, BacklinksResultsLoading } from "./BacklinksLoadingSkeletons";

const meta = {
  component: BacklinksPageLoading,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-bg p-4 text-fg sm:p-6">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: "fullscreen" },
  title: "Backlinks/Loading",
} satisfies Meta<typeof BacklinksPageLoading>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Page: Story = {};

export const Results: Story = {
  render: () => <BacklinksResultsLoading />,
};
