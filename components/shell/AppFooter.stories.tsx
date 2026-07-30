import type { Meta, StoryObj } from "@storybook/react";
import { AppFooter } from "./AppFooter";

const meta = {
  title: "Shell/AppFooter",
  component: AppFooter,
  args: {
    schemaStatus: "ok",
    workerStatus: "ok",
  },
  parameters: { layout: "fullscreen" },
  render: (args) => (
    <div className="flex min-h-[160px] flex-col justify-end bg-bg text-fg">
      <AppFooter {...args} />
    </div>
  ),
} satisfies Meta<typeof AppFooter>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Healthy: Story = {};

export const WorkerDown: Story = {
  args: { workerStatus: "stale" },
};

export const ManualMode: Story = {
  args: { schemaStatus: "unknown", workerStatus: "unknown" },
};

export const SchemaDrift: Story = {
  args: { schemaStatus: "drift" },
};
