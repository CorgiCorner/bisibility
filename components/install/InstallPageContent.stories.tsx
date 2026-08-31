import type { Meta, StoryObj } from "@storybook/react";
import { InstallPageContent } from "./InstallPageContent";

const meta = {
  title: "Install/PageContent",
  component: InstallPageContent,
  decorators: [
    (Story) => (
      <main className="min-h-screen bg-bg p-6 text-fg">
        <Story />
      </main>
    ),
  ],
  parameters: { nextjs: { appDirectory: true } },
} satisfies Meta<typeof InstallPageContent>;

export default meta;

type Story = StoryObj<typeof meta>;

const commonArgs = {
  apiKey: null,
  isCloudHosted: true,
  mcpUrl: "https://app.example.com/api/mcp",
  origin: "https://app.example.com",
  projectRef: "prj_abcdefghijklmnopqrstuvwx",
} satisfies Story["args"];

export const WithApiKey: Story = {
  args: {
    ...commonArgs,
    apiKey: {
      createdLabel: "created 2026-08-16",
      maskedValue: "bsk_example_******",
      scopeLabel: "Read and write",
    },
  },
};

export const WithoutApiKey: Story = {
  args: { ...commonArgs, apiKey: null },
};
