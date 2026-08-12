import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";
import { StepConnectGscCard } from "./StepConnectGscCard";

const meta = {
  title: "Onboarding/StepConnectGscCard",
  component: StepConnectGscCard,
  decorators: [
    (Story) => (
      <div className="min-h-[260px] bg-bg p-6 text-fg">
        <div className="mx-auto max-w-[760px] rounded-2xl border border-border bg-bg-elev p-6">
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    configured: true,
    projectId: "prj_7Kd2Qf9m",
  },
  parameters: { nextjs: { appDirectory: true } },
} satisfies Meta<typeof StepConnectGscCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Configured: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const description = canvas.getByText(
      "Free - import real queries, clicks, and impressions. No API key is needed.",
    );
    const connectButton = canvas.getByRole("link", { name: "Connect" });

    await expect(
      Math.round(
        connectButton.getBoundingClientRect().top - description.getBoundingClientRect().bottom,
      ),
    ).toBe(16);
  },
};

export const JustConnected: Story = {
  args: {
    connectedPropertyLabel: "sc-domain:acme.dev",
    justConnected: true,
  },
};

export const NotConfigured: Story = {
  args: {
    configured: false,
  },
};
