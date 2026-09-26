import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import messages from "@/messages/core/en/project-install.json";
import type { Meta, StoryObj } from "@storybook/react";
import { InstallPageContent } from "./InstallPageContent";

const meta = {
  title: "Install/PageContent",
  component: InstallPageContent,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider locale="en" messages={messages} timeZone="UTC">
        <main className="min-h-screen bg-bg p-6 text-fg">
          <Story />
        </main>
      </FeatureMessagesProvider>
    ),
  ],
  parameters: { nextjs: { appDirectory: true } },
} satisfies Meta<typeof InstallPageContent>;

export default meta;

type Story = StoryObj<typeof meta>;

const commonArgs = {
  apiKey: null,
  hasKeywordAndCheck: false,
  isCloudHosted: true,
  mcpToolCounts: { readOnly: 3, total: 5 },
  mcpUrl: "https://app.example.com/api/mcp",
  origin: "https://app.example.com",
  projectRef: "prj_abcdefghijklmnopqrstuvwx",
} satisfies Story["args"];

export const WithApiKey: Story = {
  args: {
    ...commonArgs,
    apiKey: {
      createdAt: new Date("2026-08-16T12:00:00.000Z"),
      maskedValue: "bsk_example_******",
      scope: "write",
    },
  },
};

export const WithoutApiKey: Story = {
  args: { ...commonArgs, apiKey: null },
};

export const WithKeywordAndCheck: Story = {
  args: {
    ...commonArgs,
    apiKey: {
      createdAt: new Date("2026-08-16T12:00:00.000Z"),
      maskedValue: "bsk_example_******",
      scope: "write",
    },
    hasKeywordAndCheck: true,
  },
};
