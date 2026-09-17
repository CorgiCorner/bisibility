import { withExperimentalSettingsMessages } from "@/.storybook/settings-shell-messages";
import { ExperimentalModulesSection } from "@/components/settings/experimental/ExperimentalModulesSection";
import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  component: ExperimentalModulesSection,
  decorators: [
    (Story) => (
      <main className="min-h-screen bg-bg p-4 text-fg sm:p-6">
        <SettingsShell activeSection="experimental" projectRef="prj_story">
          <Story />
        </SettingsShell>
      </main>
    ),
    withExperimentalSettingsMessages,
  ],
  parameters: { nextjs: { appDirectory: true } },
  title: "Settings/Experimental",
} satisfies Meta<typeof ExperimentalModulesSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Editable: Story = {
  args: {
    canEdit: true,
    enabledExperimentalModules: ["timeline"],
    projectId: "prj_story",
    updateExperimentalModules: async ({ enabledExperimentalModules }) => ({
      enabledExperimentalModules,
    }),
  },
  render: (args) => <ExperimentalModulesSection {...args} />,
};

export const ReadOnly: Story = {
  args: {
    canEdit: false,
    enabledExperimentalModules: ["timeline"],
    projectId: "prj_story",
    updateExperimentalModules: async ({ enabledExperimentalModules }) => ({
      enabledExperimentalModules,
    }),
  },
  render: (args) => <ExperimentalModulesSection {...args} />,
};
