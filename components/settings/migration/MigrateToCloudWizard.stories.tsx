import { withAdvancedSettingsMessages } from "@/.storybook/settings-shell-messages";
import type { Meta, StoryObj } from "@storybook/react";
import { MigrateToCloudWizard } from "./MigrateToCloudWizard";

const meta = {
  component: MigrateToCloudWizard,
  decorators: [withAdvancedSettingsMessages],
  parameters: { nextjs: { appDirectory: true } },
  title: "Settings/Migration wizard",
} satisfies Meta<typeof MigrateToCloudWizard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DestinationCheck: Story = {
  args: {
    defaultTargetOrigin: "https://cloud.example.com",
    direction: "to-cloud",
    domain: "example.com",
    onClose: () => undefined,
    open: true,
    projectId: "prj_story",
  },
};
