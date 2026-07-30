import type { Meta, StoryObj } from "@storybook/react";
import { UsageBillingSection } from "./UsageBillingSection";

const submitInterest = async () => ({ email: "owner@example.com", ok: true });

const meta = {
  args: { email: "owner@example.com", projectId: "prj_story", submitInterest },
  component: UsageBillingSection,
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-[780px] bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
  title: "Settings/Usage & billing",
} satisfies Meta<typeof UsageBillingSection>;

export default meta;

type Story = StoryObj<typeof meta>;

export const SelfHost: Story = {
  args: { variant: "self-host" },
};

export const CloudBeta: Story = {
  args: { variant: "cloud-beta" },
};
